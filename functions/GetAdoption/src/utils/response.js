const { loadTranslations, getTranslation } = require("./i18n");

function createErrorResponse(statusCode, error, event) {
  const translations = loadTranslations(event.locale || event.queryStringParameters?.lang || "zh");
  const { corsHeaders } = require("../cors");

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(event),
    },
    body: JSON.stringify({
      success: false,
      errorKey: error,
      error: getTranslation(translations, error),
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
}

function createSuccessResponse(statusCode, event, data = {}, extraHeaders = {}) {
  const { corsHeaders } = require("../cors");

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

module.exports = { createErrorResponse, createSuccessResponse };