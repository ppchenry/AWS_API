const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");

const DEFAULT_LANG = "en";

function resolveLang(event) {
  return (
    event?.queryStringParameters?.lang
    || event?.headers?.["x-language"]
    || event?.headers?.["X-Language"]
    || DEFAULT_LANG
  );
}

const createErrorResponse = (statusCode, error, event) => {
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders(event),
  };

  const translations = loadTranslations(resolveLang(event));
  const errorMessage = getTranslation(translations, error);

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

module.exports = {
  createErrorResponse,
  createSuccessResponse,
};
