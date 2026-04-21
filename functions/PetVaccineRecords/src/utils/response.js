const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");

function getRequestLanguage(event) {
  return event.cookies?.language || event.queryStringParameters?.lang || "zh";
}

const createErrorResponse = (statusCode, error, event) => {
  const defaultHeaders = {
    "Content-Type": "application/json",
    ...corsHeaders(event),
  };

  const translations = loadTranslations(getRequestLanguage(event));
  const errorMessage = translations ? getTranslation(translations, error) : error;

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

const createSuccessResponse = (statusCode, event, data = {}, extraHeaders = {}) => {
  const translations = loadTranslations(getRequestLanguage(event));
  const responseData = { ...data };

  if (typeof responseData.message === "string") {
    responseData.message = getTranslation(translations, responseData.message);
  }

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(event),
      ...extraHeaders,
    },
    body: JSON.stringify({
      success: true,
      ...responseData,
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
};

module.exports = {
  createErrorResponse,
  createSuccessResponse,
};