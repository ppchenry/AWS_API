const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");
const { logWarn } = require("./logger");

const createErrorResponse = (statusCode, error, event) => {
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

  const translations = loadTranslations(event.locale || "zh");
  const errorMessage = translations ? getTranslation(translations, error) : error;

  return {
    statusCode,
    headers,
    body: JSON.stringify({
      success: false,
      errorKey: error,
      error: errorMessage,
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
};

const createSuccessResponse = (statusCode, event, data = {}, extraHeaders = {}) => {
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
};

module.exports = { createErrorResponse, createSuccessResponse };
