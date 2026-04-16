const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");

const createErrorResponse = (statusCode, error, event) => {
  const defaultHeaders = {
    "Content-Type": "application/json",
    ...corsHeaders(event),
  };

  const translations = loadTranslations(
    event.cookies?.language || event.queryStringParameters?.lang || "zh"
  );

  const errorMessage = translations
    ? getTranslation(translations, error)
    : error;

  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify({
      success: false,
      errorKey: error,
      error: errorMessage,
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
};

const createSuccessResponse = (
  statusCode,
  event,
  data = {},
  extraHeaders = {}
) => {
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
