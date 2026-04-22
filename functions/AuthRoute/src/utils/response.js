const { corsHeaders } = require("../cors");
const { loadTranslations, getTranslation } = require("./i18n");
const { logWarn } = require("./logger");

function createErrorResponse(statusCode, error, event) {
  if (statusCode >= 400 && statusCode < 500) {
    logWarn("Expected client error response", {
      scope: "utils.response.createErrorResponse",
      event,
      extra: { statusCode, errorKey: error },
    });
  }

  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders(event),
  };

  const translations = loadTranslations(
    event.queryStringParameters?.lang || event.cookies?.language || "en"
  );

  return {
    statusCode,
    headers,
    body: JSON.stringify({
      success: false,
      errorKey: error,
      error: getTranslation(translations, error),
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
}

function createSuccessResponse(statusCode, event, data = {}, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(event),
      ...extraHeaders,
    },
    body: JSON.stringify({
      success: true,
      ...data,
    }),
  };
}

module.exports = {
  createErrorResponse,
  createSuccessResponse,
};
