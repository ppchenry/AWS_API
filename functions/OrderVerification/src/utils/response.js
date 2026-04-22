const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");
const { logWarn } = require("./logger");

const DEFAULT_LANG = "en";

/**
 * Resolves the request language for translated error responses.
 *
 * @param {Record<string, any>} [event]
 * @returns {string}
 */
function resolveLang(event) {
  return (
    event?.queryStringParameters?.lang
    || event?.headers?.["x-language"]
    || event?.headers?.["X-Language"]
    || DEFAULT_LANG
  );
}

/**
 * Builds the standard error response payload for the Lambda.
 *
 * @param {number} statusCode
 * @param {string} error
 * @param {Record<string, any>} event
 * @returns {{statusCode:number, headers:Record<string,string>, body:string}}
 */
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

/**
 * Builds the standard success response payload for the Lambda.
 *
 * @param {number} statusCode
 * @param {Record<string, any>} event
 * @param {Record<string, any>} [data]
 * @param {Record<string, string>} [extraHeaders]
 * @returns {{statusCode:number, headers:Record<string,string>, body:string}}
 */
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
