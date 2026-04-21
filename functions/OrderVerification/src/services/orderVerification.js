const { parse } = require("lambda-multipart-parser");
const { connectToMongoDB, getReadConnection } = require("../config/db");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError, logInfo, logWarn } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { supplierUpdateSchema, tagUpdateSchema } = require("../zodSchema/orderVerificationSchema");
const { loadAuthorizedOrderByTempId, loadAuthorizedSupplierOrderVerification } = require("../middleware/selfAccess");
const { sanitizeOrderVerification, sanitizeOrder } = require("../utils/sanitize");
const { parseDDMMYYYY, normalizeEmail, normalizePhone } = require("../utils/validators");

const ORDER_VERIFICATION_READ_PROJECTION = [
  "_id",
  "tagId",
  "staffVerification",
  "contact",
  "verifyDate",
  "tagCreationDate",
  "petName",
  "shortUrl",
  "masterEmail",
  "qrUrl",
  "petUrl",
  "orderId",
  "location",
  "petHuman",
  "createdAt",
  "updatedAt",
  "pendingStatus",
  "option",
  "type",
  "optionSize",
  "optionColor",
  "price",
  "cancelled",
].join(" ");

const ORDER_READ_PROJECTION = [
  "_id",
  "tempId",
  "lastName",
  "phoneNumber",
  "petContact",
  "sfWayBillNumber",
  "language",
].join(" ");

/**
 * Returns supplier lookup results by orderId, contact, or tagId fallback.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function getSupplierOrderVerification({ event }) {
  try {
    const orderId = event.pathParameters?.orderId;
    if (!orderId) {
      return createErrorResponse(400, "orderVerification.errors.missingOrderId", event);
    }

    const conn = await getReadConnection();
    const OrderVerification = conn.model("OrderVerification");
    const Order = conn.model("Order");

    const authorization = await loadAuthorizedSupplierOrderVerification({
      event,
      OrderVerification,
      Order,
      identifier: orderId,
      projection: ORDER_VERIFICATION_READ_PROJECTION,
    });
    if (!authorization.isValid) {
      return authorization.error;
    }

    const orderVerify = authorization.orderVerification;

    if (!orderVerify) {
      return createErrorResponse(404, "orderVerification.errors.notFound", event);
    }

    const safeEntity = sanitizeOrderVerification(orderVerify);
    const form = {
      tagId: safeEntity.tagId,
      staffVerification: safeEntity.staffVerification,
      contact: safeEntity.contact,
      verifyDate: safeEntity.verifyDate,
      tagCreationDate: safeEntity.tagCreationDate,
      petName: safeEntity.petName,
      shortUrl: safeEntity.shortUrl,
      masterEmail: safeEntity.masterEmail,
      qrUrl: safeEntity.qrUrl,
      petUrl: safeEntity.petUrl,
      orderId: safeEntity.orderId,
      location: safeEntity.location,
      petHuman: safeEntity.petHuman,
      createdAt: safeEntity.createdAt,
      updatedAt: safeEntity.updatedAt,
      pendingStatus: safeEntity.pendingStatus,
      option: safeEntity.option,
      optionSize: safeEntity.optionSize,
      optionColor: safeEntity.optionColor,
    };

    return createSuccessResponse(200, event, {
      message: "Order Verification info retrieved successfully",
      form,
      id: safeEntity._id,
    });
  } catch (error) {
    logError("Failed to get supplier order verification", {
      scope: "services.orderVerification.getSupplierOrderVerification",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Updates supplier-editable verification fields from a multipart payload.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function updateSupplierOrderVerification({ event }) {
  try {
    const orderId = event.pathParameters?.orderId;
    if (!orderId) {
      return createErrorResponse(400, "orderVerification.errors.missingOrderId", event);
    }

    await connectToMongoDB();
    const conn = await getReadConnection();
    const OrderVerification = conn.model("OrderVerification");
    const Order = conn.model("Order");

    const authorization = await loadAuthorizedSupplierOrderVerification({
      event,
      OrderVerification,
      Order,
      identifier: orderId,
      projection: "_id orderId masterEmail",
    });
    if (!authorization.isValid) {
      return authorization.error;
    }

    const existingOrderVerification = authorization.orderVerification;

    if (!existingOrderVerification) {
      return createErrorResponse(404, "orderVerification.errors.notFound", event);
    }

    const parsedBody = await parse(event);
    const parseResult = supplierUpdateSchema.safeParse(parsedBody || {});
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const payload = parseResult.data;
    const setFields = {};

    if (payload.contact) setFields.contact = normalizePhone(payload.contact);
    if (payload.petName) setFields.petName = payload.petName;
    if (payload.shortUrl) setFields.shortUrl = payload.shortUrl;
    if (payload.masterEmail) setFields.masterEmail = normalizeEmail(payload.masterEmail);
    if (payload.location) setFields.location = payload.location;
    if (payload.petHuman) setFields.petHuman = payload.petHuman;
    if (payload.pendingStatus !== undefined) setFields.pendingStatus = payload.pendingStatus;
    if (payload.qrUrl) setFields.qrUrl = payload.qrUrl;
    if (payload.petUrl) setFields.petUrl = payload.petUrl;

    if (Object.keys(setFields).length === 0 && !payload.petContact) {
      return createErrorResponse(400, "others.missingParams", event);
    }

    if (payload.petContact && existingOrderVerification.orderId) {
      await Order.updateOne(
        { tempId: existingOrderVerification.orderId },
        { $set: { petContact: normalizePhone(payload.petContact) } }
      );
    }

    const updateOperation = Object.keys(setFields).length > 0 ? { $set: setFields } : {};

    const updateResult = await OrderVerification.updateOne(
      { _id: existingOrderVerification._id },
      updateOperation
    );

    if (updateResult.matchedCount === 0) {
      return createErrorResponse(404, "orderVerification.errors.notFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "Tag info updated successfully",
      updateResult,
    });
  } catch (error) {
    logError("Failed to update supplier order verification", {
      scope: "services.orderVerification.updateSupplierOrderVerification",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Returns the order contact summary for a temp order id.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function getOrderInfo({ event }) {
  try {
    const tempId = event.pathParameters?.tempId;
    if (!tempId) {
      return createErrorResponse(400, "orderVerification.errors.missingTempId", event);
    }

    const conn = await getReadConnection();
    const Order = conn.model("Order");

    const authorization = await loadAuthorizedOrderByTempId({
      event,
      Order,
      tempId,
      projection: ORDER_READ_PROJECTION,
    });
    if (!authorization.isValid) {
      return authorization.error;
    }

    const order = authorization.order;
    if (!order) {
      return createErrorResponse(404, "orderVerification.errors.orderNotFound", event);
    }

    const safeOrder = sanitizeOrder(order);
    return createSuccessResponse(200, event, {
      message: "Order Verification info retrieved successfully",
      form: {
        petContact: safeOrder.petContact,
      },
      id: safeOrder._id,
    });
  } catch (error) {
    logError("Failed to get order info", {
      scope: "services.orderVerification.getOrderInfo",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Returns order verification details for the WhatsApp deep-link flow.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function getWhatsAppOrderLink({ event }) {
  try {
    const verificationId = event.pathParameters?._id;
    if (!verificationId) {
      return createErrorResponse(400, "orderVerification.errors.missingVerificationId", event);
    }

    const conn = await getReadConnection();
    const OrderVerification = conn.model("OrderVerification");
    const Order = conn.model("Order");

    const orderVerify = await OrderVerification.findOne({ _id: verificationId }).select(ORDER_VERIFICATION_READ_PROJECTION).lean();
    if (!orderVerify) {
      return createErrorResponse(404, "orderVerification.errors.notFound", event);
    }

    if (event.userRole !== "admin" && event.userRole !== "developer") {
      const linkedOrderAuthorization = orderVerify.orderId
        ? await loadAuthorizedOrderByTempId({ event, Order, tempId: orderVerify.orderId })
        : { isValid: true, order: null };

      if (!linkedOrderAuthorization.isValid) {
        return linkedOrderAuthorization.error;
      }

      if (!linkedOrderAuthorization.order) {
        const callerEmail = normalizeEmail(event.userEmail || event.user?.userEmail || event.user?.email);
        const ownerEmail = normalizeEmail(orderVerify.masterEmail);
        if (!callerEmail || !ownerEmail || callerEmail !== ownerEmail) {
          return createErrorResponse(403, "others.unauthorized", event);
        }
      }
    }

    const safeEntity = sanitizeOrderVerification(orderVerify);
    const form = {
      tagId: safeEntity.tagId,
      staffVerification: safeEntity.staffVerification,
      contact: safeEntity.contact,
      verifyDate: safeEntity.verifyDate,
      tagCreationDate: safeEntity.tagCreationDate,
      petName: safeEntity.petName,
      shortUrl: safeEntity.shortUrl,
      masterEmail: safeEntity.masterEmail,
      qrUrl: safeEntity.qrUrl,
      petUrl: safeEntity.petUrl,
      orderId: safeEntity.orderId,
      location: safeEntity.location,
      petHuman: safeEntity.petHuman,
      pendingStatus: safeEntity.pendingStatus,
      option: safeEntity.option,
      price: safeEntity.price,
      type: safeEntity.type,
      optionSize: safeEntity.optionSize,
      optionColor: safeEntity.optionColor,
      createdAt: safeEntity.createdAt,
      updatedAt: safeEntity.updatedAt,
    };

    return createSuccessResponse(200, event, {
      message: "Order Verification info retrieved successfully",
      form,
      id: safeEntity._id,
    });
  } catch (error) {
    logError("Failed to get WhatsApp order link", {
      scope: "services.orderVerification.getWhatsAppOrderLink",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Returns the allowlisted set of verification orders used by the admin list view.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function getAllOrders({ event }) {
  try {
    const conn = await getReadConnection();
    const OrderVerification = conn.model("OrderVerification");

    const allOrders = await OrderVerification.find({
      cancelled: { $exists: true },
    }).select(ORDER_VERIFICATION_READ_PROJECTION).lean();

    if (!allOrders || allOrders.length === 0) {
      return createErrorResponse(404, "orderVerification.errors.noOrders", event);
    }

    return createSuccessResponse(200, event, {
      message: "Latest PTag orders retrieved successfully",
      allOrders: allOrders.map(sanitizeOrderVerification),
    });
  } catch (error) {
    logError("Failed to get all orders", {
      scope: "services.orderVerification.getAllOrders",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Returns verification details for a tag id, including linked SF waybill data.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function getTagOrderVerification({ event }) {
  try {
    const tagId = event.pathParameters?.tagId;
    if (!tagId) {
      return createErrorResponse(400, "orderVerification.errors.missingTagId", event);
    }

    const conn = await getReadConnection();
    const OrderVerification = conn.model("OrderVerification");
    const Order = conn.model("Order");

    const orderVerify = await OrderVerification.findOne({ tagId }).select(ORDER_VERIFICATION_READ_PROJECTION).lean();
    if (!orderVerify) {
      return createErrorResponse(404, "orderVerification.errors.notFound", event);
    }

    const safeEntity = sanitizeOrderVerification(orderVerify);
    const order = await Order.findOne({ tempId: safeEntity.orderId }).select("sfWayBillNumber").lean();

    const form = {
      tagId: safeEntity.tagId,
      staffVerification: safeEntity.staffVerification,
      contact: safeEntity.contact,
      verifyDate: safeEntity.verifyDate,
      tagCreationDate: safeEntity.tagCreationDate,
      petName: safeEntity.petName,
      shortUrl: safeEntity.shortUrl,
      masterEmail: safeEntity.masterEmail,
      qrUrl: safeEntity.qrUrl,
      petUrl: safeEntity.petUrl,
      orderId: safeEntity.orderId,
      location: safeEntity.location,
      petHuman: safeEntity.petHuman,
      createdAt: safeEntity.createdAt,
      updatedAt: safeEntity.updatedAt,
      pendingStatus: safeEntity.pendingStatus,
      option: safeEntity.option,
    };

    return createSuccessResponse(200, event, {
      message: "Order Verification info retrieved successfully",
      form,
      id: safeEntity._id,
      sf: order?.sfWayBillNumber,
    });
  } catch (error) {
    logError("Failed to get tag order verification", {
      scope: "services.orderVerification.getTagOrderVerification",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Formats the estimated delivery window for the outbound WhatsApp template.
 *
 * @param {{ verifyDate?: string|Date|null, language?: string }} args
 * @returns {string}
 */
function buildDeliveryText({ verifyDate, language }) {
  let estStart;
  let estEnd;

  if (verifyDate) {
    const verifyDt = new Date(verifyDate);
    estStart = new Date(verifyDt);
    estStart.setDate(verifyDt.getDate() + 2);
    estEnd = new Date(verifyDt);
    estEnd.setDate(verifyDt.getDate() + 4);
  } else {
    estStart = new Date();
    estStart.setDate(estStart.getDate() + 3);
    estEnd = new Date();
    estEnd.setDate(estEnd.getDate() + 5);
  }

  if (language === "chn") {
    const startMonth = estStart.getMonth() + 1;
    const startDay = estStart.getDate();
    const endDay = estEnd.getDate();

    if (estStart.getMonth() !== estEnd.getMonth()) {
      const endMonth = estEnd.getMonth() + 1;
      return `${startMonth} 月 ${startDay} 日至 ${endMonth} 月 ${endDay} 日`;
    }

    return `${startMonth} 月 ${startDay} 日至 ${endDay} 日`;
  }

  const startMonthStr = estStart.toLocaleDateString("en-US", { month: "short" });
  const startDay = estStart.getDate();
  const endMonthStr = estEnd.toLocaleDateString("en-US", { month: "short" });
  const endDay = estEnd.getDate();

  if (estStart.getFullYear() === estEnd.getFullYear() && estStart.getMonth() === estEnd.getMonth()) {
    return `${startMonthStr} ${startDay} - ${endDay}`;
  }

  return `${startMonthStr} ${startDay} - ${endMonthStr} ${endDay}`;
}

/**
 * Posts JSON to the WhatsApp provider and throws on provider-visible failures.
 *
 * @param {string} url
 * @param {Record<string, any>} data
 * @param {Record<string, string>} headers
 * @returns {Promise<Record<string, any>>}
 */
async function postData(url, data, headers) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  const text = await response.text();
  let parsedBody;

  try {
    parsedBody = JSON.parse(text);
  } catch (_err) {
    parsedBody = { raw: text };
  }

  if (!response.ok || parsedBody?.error) {
    const providerError = parsedBody?.error?.message || parsedBody?.raw || `HTTP ${response.status}`;
    throw new Error(providerError);
  }

  return parsedBody;
}

/**
 * Sends the tracking update WhatsApp template when order data is complete.
 *
 * @param {{ order: Record<string, any>|null|undefined, orderVerification: Record<string, any>|null|undefined, event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<{ dispatched: boolean, reason?: string }>}
 */
async function dispatchWhatsAppTrackingMessage({ order, orderVerification, event }) {
  const token = process.env.WHATSAPP_BEARER_TOKEN;
  if (!token) {
    logWarn("Skipping WhatsApp notification due to missing bearer token", {
      scope: "services.orderVerification.dispatchWhatsAppTrackingMessage",
      event,
    });
    return { dispatched: false, reason: "missing-token" };
  }

  if (!order?.phoneNumber || !order?.sfWayBillNumber) {
    logWarn("Skipping WhatsApp notification due to missing order phone or waybill", {
      scope: "services.orderVerification.dispatchWhatsAppTrackingMessage",
      event,
      extra: {
        orderId: order?.tempId,
      },
    });
    return { dispatched: false, reason: "missing-order-contact" };
  }

  const deliveryText = buildDeliveryText({
    verifyDate: orderVerification?.verifyDate,
    language: order?.language,
  });

  const lang = order?.language === "chn" ? "chn" : "en";
  const templateName = lang === "chn" ? "ptag_track_chn" : "ptag_track_eng";
  const languageCode = lang === "chn" ? "zh_CN" : "en";
  const whatsappNumber = `+852${normalizePhone(order.phoneNumber)}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: token,
  };

  const data = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: whatsappNumber,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: order.lastName || "" },
            { type: "text", text: order.tempId || "" },
            { type: "text", text: order.sfWayBillNumber || "" },
            { type: "text", text: deliveryText },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [
            {
              type: "text",
              text: order.sfWayBillNumber,
            },
          ],
        },
      ],
    },
  };

  const result = await postData(
    "https://graph.facebook.com/v22.0/942066048990138/messages",
    data,
    headers
  );

  logInfo("WhatsApp tracking message dispatched", {
    scope: "services.orderVerification.dispatchWhatsAppTrackingMessage",
    event,
    extra: {
      templateName,
      to: whatsappNumber,
      providerResult: result,
    },
  });

  return { dispatched: true };
}

/**
 * Updates the tag-bound verification record and attempts post-update notification dispatch.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent, body?: Record<string, any>|null }} args
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function updateTagOrderVerification({ event, body }) {
  try {
    const tagId = event.pathParameters?.tagId;
    if (!tagId) {
      return createErrorResponse(400, "orderVerification.errors.missingTagId", event);
    }

    const parseResult = tagUpdateSchema.safeParse(body || {});
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const payload = parseResult.data;

    await connectToMongoDB();
    const conn = await getReadConnection();
    const OrderVerification = conn.model("OrderVerification");
    const Order = conn.model("Order");

    const existing = await OrderVerification.findOne({ tagId }).select("_id orderId").lean();
    if (!existing) {
      return createErrorResponse(404, "orderVerification.errors.notFound", event);
    }

    if (payload.orderId !== undefined && payload.orderId !== existing.orderId) {
      const duplicated = await OrderVerification.findOne({ orderId: payload.orderId }).select("_id").lean();
      if (duplicated) {
        return createErrorResponse(409, "orderVerification.errors.duplicateOrderId", event);
      }
    }

    const setFields = {};
    if (payload.contact) setFields.contact = normalizePhone(payload.contact);
    if (payload.verifyDate !== undefined) {
      const parsedVerifyDate = parseDDMMYYYY(payload.verifyDate);
      if (!parsedVerifyDate) {
        return createErrorResponse(400, "orderVerification.errors.invalidDate", event);
      }
      setFields.verifyDate = parsedVerifyDate;
    }
    if (payload.petName) setFields.petName = payload.petName;
    if (payload.shortUrl) setFields.shortUrl = payload.shortUrl;
    if (payload.masterEmail) setFields.masterEmail = normalizeEmail(payload.masterEmail);
    if (payload.orderId !== undefined) setFields.orderId = payload.orderId;
    if (payload.location) setFields.location = payload.location;
    if (payload.petHuman) setFields.petHuman = payload.petHuman;

    const updateOperation = Object.keys(setFields).length > 0 ? { $set: setFields } : {};
    await OrderVerification.updateOne({ tagId }, updateOperation);

    const updatedVerification = await OrderVerification.findOne({ tagId }).select(ORDER_VERIFICATION_READ_PROJECTION).lean();
    const linkedOrder = await Order.findOne({ tempId: updatedVerification?.orderId }).select(ORDER_READ_PROJECTION).lean();

    let notificationDispatched = false;
    try {
      const notificationResult = await dispatchWhatsAppTrackingMessage({
        order: linkedOrder,
        orderVerification: updatedVerification,
        event,
      });
      notificationDispatched = notificationResult?.dispatched === true;
    } catch (error) {
      logWarn("WhatsApp tracking dispatch failed after successful update", {
        scope: "services.orderVerification.updateTagOrderVerification",
        event,
        error,
        extra: {
          tagId,
          orderId: updatedVerification?.orderId,
        },
      });
    }

    return createSuccessResponse(200, event, {
      message: "Tag info updated successfully",
      id: existing._id,
      notificationDispatched,
    });
  } catch (error) {
    logError("Failed to update tag order verification", {
      scope: "services.orderVerification.updateTagOrderVerification",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getSupplierOrderVerification,
  updateSupplierOrderVerification,
  getOrderInfo,
  getWhatsAppOrderLink,
  getAllOrders,
  getTagOrderVerification,
  updateTagOrderVerification,
};
