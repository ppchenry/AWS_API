const https = require("https");
const crypto = require("crypto");
const axios = require("axios");
const querystring = require("querystring");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const { connectToMongoDB, getReadConnection } = require("../config/db");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError, logInfo } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { enforceRateLimit } = require("../utils/rateLimit");
const {
  createOrderSchema,
  printCloudWaybillSchema,
  getAreaSchema,
  getNetCodeSchema,
  getPickupLocationsSchema,
} = require("../zodSchema/sfExpressSchema");

const SF_OAUTH_URL = "https://sfapi.sf-express.com/oauth2/accessToken";
const SF_SERVICE_URL = "https://sfapi.sf-express.com/std/service";
const SF_CLOUD_PRINT_URL = "https://bspgw.sf-express.com/std/service";

const SF_ADDRESS_LOGIN_URL = "http://hksfadd.sf-express.com/api/address_api/login";
const SF_ADDRESS_AREA_URL = "http://hksfaddsit.sf-express.com/api/address_api/area";
const SF_ADDRESS_NETCODE_URL = "http://hksfaddsit.sf-express.com/api/address_api/netCode";
const SF_ADDRESS_DETAIL_URL = "http://hksfaddsit.sf-express.com/api/address_api/address";

function generateUUID() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

async function requestJsonWithHttps({ url, method, headers, body }) {
  const parsedUrl = new URL(url);

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method,
    headers,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, body: parsed });
        } catch (_error) {
          reject(new Error("Invalid JSON response"));
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken() {
  const postData = querystring.stringify({
    grantType: "password",
    secret: process.env.SF_PRODUCTION_CHECK_CODE,
    partnerID: process.env.SF_CUSTOMER_CODE,
  });

  const response = await requestJsonWithHttps({
    url: SF_OAUTH_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
    },
    body: postData,
  });

  if (response.status < 200 || response.status >= 300 || !response.body.accessToken) {
    throw new Error("Unable to fetch SF access token");
  }

  return response.body.accessToken;
}

async function callSfStdService({ serviceCode, msgData, accessToken, url = SF_SERVICE_URL }) {
  const postData = querystring.stringify({
    partnerID: process.env.SF_CUSTOMER_CODE,
    requestID: generateUUID(),
    serviceCode,
    timestamp: Date.now().toString(),
    accessToken,
    msgData: JSON.stringify(msgData),
  });

  const response = await requestJsonWithHttps({
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
    },
    body: postData,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error("sfExpress.errors.sfApiError");
  }

  if (response.body.apiResultCode !== "A1000") {
    throw new Error("sfExpress.errors.sfApiError");
  }

  let apiResultData;
  try {
    apiResultData = JSON.parse(response.body.apiResultData || "{}");
  } catch (_error) {
    throw new Error("sfExpress.errors.invalidSfResponse");
  }

  return apiResultData;
}

async function downloadPdf(url, token) {
  const parsed = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: { "X-Auth-token": token },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error("sfExpress.errors.sfApiError"));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );

    req.on("error", reject);
    req.end();
  });
}

async function sendWaybillEmail({ to, subject, waybillNo, pdfBuffer }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number.parseInt(process.env.SMTP_PORT, 10) : 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PTag | Waybill ${waybillNo}</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;color:#050505;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;background:white;margin:20px 0;">
                <tr>
                  <td style="padding:20px;">
                    <h1 style="margin:0 0 16px 0;font-size:32px;">PTag</h1>
                    <p style="margin:0 0 12px 0;">Hello,</p>
                    <p style="margin:0 0 12px 0;">Please find the attached waybill PDF for <strong>${waybillNo}</strong>.</p>
                    <p style="margin:0;">Best regards,<br/>PTag</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
    attachments: [
      {
        filename: `Waybill_${waybillNo}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

async function createOrder({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-create-order",
      limit: 20,
      windowSec: 300,
      identifier: event.userId || "anonymous",
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = createOrderSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const customerDetails = parseResult.data;
    const accessToken = await getAccessToken();

    const requestPayload = {
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
    };

    const apiResultData = await callSfStdService({
      serviceCode: "EXP_RECE_CREATE_ORDER",
      msgData: requestPayload,
      accessToken,
      url: SF_SERVICE_URL,
    });

    const trackingNumber = apiResultData.msgData?.waybillNoInfoList?.[0]?.waybillNo;
    if (!trackingNumber) {
      return createErrorResponse(500, "sfExpress.errors.missingWaybill", event);
    }

    await connectToMongoDB();
    const orderReadModel = (await getReadConnection()).model("Order");
    const orderWriteModel = mongoose.model("Order");

    if (Array.isArray(customerDetails.tempIdList) && customerDetails.tempIdList.length > 0) {
      await Promise.all(customerDetails.tempIdList.map(async (tempId) => {
        const existing = await orderReadModel.findOne({ tempId }).select("_id").lean();
        if (!existing) return;

        await orderWriteModel.updateOne(
          { tempId },
          {
            $set: {
              sfWayBillNumber: trackingNumber,
            },
          }
        );
      }));
    } else if (customerDetails.tempId) {
      const existing = await orderReadModel.findOne({ tempId: customerDetails.tempId }).select("_id").lean();
      if (existing) {
        await orderWriteModel.updateOne(
          { tempId: customerDetails.tempId },
          {
            $set: {
              sfWayBillNumber: trackingNumber,
            },
          }
        );
      }
    }

    return createSuccessResponse(200, event, {
      message: "Order created and saved",
      tempIdList: customerDetails.tempIdList,
      trackingNumber,
    });
  } catch (error) {
    logError("Failed to create SF order", {
      scope: "services.sfExpress.createOrder",
      event,
      error,
    });

    const errorKey = error.message && error.message.includes("sfExpress.")
      ? error.message
      : "others.internalError";

    return createErrorResponse(500, errorKey, event);
  }
}

async function printCloudWaybill({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-print-waybill",
      limit: 20,
      windowSec: 300,
      identifier: event.userId || "anonymous",
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = printCloudWaybillSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const { waybillNo } = parseResult.data;
    const accessToken = await getAccessToken();

    const apiResultData = await callSfStdService({
      serviceCode: "COM_RECE_CLOUD_PRINT_WAYBILLS",
      msgData: {
        templateCode: "fm_150_standard_YCSKUUQ3",
        version: "2.0",
        fileType: "pdf",
        sync: true,
        documents: [{
          masterWaybillNo: waybillNo,
        }],
      },
      accessToken,
      url: SF_CLOUD_PRINT_URL,
    });

    if (apiResultData.success === false) {
      return createErrorResponse(500, "sfExpress.errors.sfApiError", event);
    }

    const files = apiResultData.obj?.files || [];
    if (files.length === 0) {
      return createErrorResponse(500, "sfExpress.errors.missingPrintFile", event);
    }

    const file = files[0];
    const pdfBuffer = await downloadPdf(file.url, file.token);

    await sendWaybillEmail({
      to: "notification@ptag.com.hk",
      subject: `PTag Waybill PDF - ${waybillNo}`,
      waybillNo,
      pdfBuffer,
    });

    return createSuccessResponse(200, event, {
      waybillNo,
    });
  } catch (error) {
    logError("Failed to print cloud waybill", {
      scope: "services.sfExpress.printCloudWaybill",
      event,
      error,
    });

    const errorKey = error.message && error.message.includes("sfExpress.")
      ? error.message
      : "others.internalError";

    return createErrorResponse(500, errorKey, event);
  }
}

async function getToken({ event }) {
  try {
    const response = await axios.post(
      SF_ADDRESS_LOGIN_URL,
      {},
      {
        headers: {
          "api-key": process.env.SF_ADDRESS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    return createSuccessResponse(200, event, {
      bearer_token: response.data?.data,
    });
  } catch (error) {
    logError("Failed to get SF address token", {
      scope: "services.sfExpress.getToken",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function getArea({ event, body }) {
  try {
    const parseResult = getAreaSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const response = await axios.get(SF_ADDRESS_AREA_URL, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parseResult.data.token}`,
      },
    });

    return createSuccessResponse(200, event, {
      area_list: response.data?.data,
    });
  } catch (error) {
    logError("Failed to get SF area list", {
      scope: "services.sfExpress.getArea",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function getNetCode({ event, body }) {
  try {
    const parseResult = getNetCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const { token, typeId, areaId } = parseResult.data;

    const response = await axios.get(`${SF_ADDRESS_NETCODE_URL}?typeId=${typeId}&areaId=${areaId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    return createSuccessResponse(200, event, {
      netCode: response.data?.data,
    });
  } catch (error) {
    logError("Failed to get SF netCode", {
      scope: "services.sfExpress.getNetCode",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function getPickupLocations({ event, body }) {
  try {
    const parseResult = getPickupLocationsSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const { token, netCode, lang } = parseResult.data;

    const addressPromises = netCode.map(async (item) => {
      const response = await axios.get(`${SF_ADDRESS_DETAIL_URL}?lang=${lang}&netCode=${item}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data?.data;
    });

    const addresses = await Promise.all(addressPromises);

    return createSuccessResponse(200, event, {
      addresses,
    });
  } catch (error) {
    logError("Failed to get SF pickup locations", {
      scope: "services.sfExpress.getPickupLocations",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  createOrder,
  getPickupLocations,
  getToken,
  getArea,
  getNetCode,
  printCloudWaybill,
};
