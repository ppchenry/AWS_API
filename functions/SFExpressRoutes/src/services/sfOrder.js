const mongoose = require("mongoose");

const { connectToMongoDB, getReadConnection } = require("../config/db");
const { loadAuthorizedOrdersForMutation } = require("../middleware/selfAccess");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { enforceRateLimit } = require("../utils/rateLimit");
const { createOrderSchema } = require("../zodSchema/sfExpressSchema");
const { callSfService, getAccessToken } = require("./sfExpressClient");
const { getConfigError, getRateLimitKey } = require("./sfShared");

async function createOrder({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-create-order",
      limit: 20,
      windowSec: 300,
      identifier: getRateLimitKey(event),
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = createOrderSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const customerDetails = parseResult.data;
    const configError = getConfigError(event, "services.sfOrder.createOrder", [
      "SF_CUSTOMER_CODE",
      "SF_PRODUCTION_CHECK_CODE",
    ]);
    if (configError) return configError;

    const orderReadModel = (await getReadConnection()).model("Order");
    const authorization = await loadAuthorizedOrdersForMutation({
      event,
      body: customerDetails,
      orderReadModel,
    });
    if (!authorization.isValid) {
      return authorization.error;
    }

    const accessToken = await getAccessToken();
    const apiResultData = await callSfService({
      serviceCode: "EXP_RECE_CREATE_ORDER",
      accessToken,
      msgData: {
        expressTypeId: 1,
        payMethod: 1,
        isGenEletricPic: 1,
        isReturnRouteLabel: 1,
        cargoDetails: [{ name: "PTag", count: customerDetails.count || 1 }],
        contactInfoList: [
          {
            contactType: 1,
            contact: "Pet Pet Club",
            tel: "85255764375",
            country: "HK",
            province: "Hong Kong",
            city: "Tsuen Wan",
            address: "D3, 29/F, TML Tower, 3 Hoi Shing Road, Tsuen Wan",
          },
          {
            contactType: 2,
            contact: customerDetails.lastName,
            tel: customerDetails.phoneNumber,
            country: "HK",
            province: "Hong Kong",
            city: "Hong Kong",
            address: customerDetails.address,
          },
        ],
        language: "zh-CN",
        orderId: `T${Math.floor(Math.random() * 1e10)}`,
        custId: process.env.SF_CUSTOMER_CODE,
        extraInfoList: [
          {
            attrName: customerDetails.attrName,
            attrVal: customerDetails.netCode,
          },
        ],
      },
    });

    const trackingNumber = apiResultData.msgData?.waybillNoInfoList?.[0]?.waybillNo;
    if (!trackingNumber) {
      return createErrorResponse(500, "sfExpress.errors.missingWaybill", event);
    }

    const matchedTempIds = authorization.orders.map((order) => order.tempId).filter(Boolean);
    if (matchedTempIds.length > 0) {
      await connectToMongoDB();
      const Order = mongoose.model("Order");
      await Order.updateMany(
        { tempId: { $in: matchedTempIds } },
        {
          $set: {
            sfWayBillNumber: trackingNumber,
          },
        }
      );
    }

    return createSuccessResponse(200, event, {
      message: "Order created and saved",
      tempIdList: customerDetails.tempIdList,
      trackingNumber,
    });
  } catch (error) {
    logError("Failed to create SF order", {
      scope: "services.sfOrder.createOrder",
      event,
      error,
    });

    const errorKey = error.message && error.message.includes("sfExpress.")
      ? error.message
      : "others.internalError";

    return createErrorResponse(500, errorKey, event);
  }
}

module.exports = {
  createOrder,
};