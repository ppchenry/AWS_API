const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { enforceRateLimit } = require("../utils/rateLimit");
const { printCloudWaybillSchema } = require("../zodSchema/sfExpressSchema");
const { SF_CLOUD_PRINT_URL, callSfService, downloadPdf, getAccessToken } = require("./sfExpressClient");
const { sendWaybillEmail } = require("./sfMail");
const { getConfigError, getRateLimitKey } = require("./sfShared");

async function printCloudWaybill({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-print-waybill",
      limit: 20,
      windowSec: 300,
      identifier: getRateLimitKey(event),
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = printCloudWaybillSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const { waybillNo } = parseResult.data;
    const configError = getConfigError(event, "services.sfWaybill.printCloudWaybill", [
      "SF_CUSTOMER_CODE",
      "SF_PRODUCTION_CHECK_CODE",
      "SMTP_FROM",
      "SMTP_HOST",
      "SMTP_PASS",
      "SMTP_PORT",
      "SMTP_USER",
    ]);
    if (configError) return configError;

    const accessToken = await getAccessToken();
    const apiResultData = await callSfService({
      serviceCode: "COM_RECE_CLOUD_PRINT_WAYBILLS",
      accessToken,
      url: SF_CLOUD_PRINT_URL,
      msgData: {
        templateCode: "fm_150_standard_YCSKUUQ3",
        version: "2.0",
        fileType: "pdf",
        sync: true,
        documents: [
          {
            masterWaybillNo: waybillNo,
          },
        ],
      },
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

    return createSuccessResponse(200, event, { waybillNo });
  } catch (error) {
    logError("Failed to print cloud waybill", {
      scope: "services.sfWaybill.printCloudWaybill",
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
  printCloudWaybill,
};