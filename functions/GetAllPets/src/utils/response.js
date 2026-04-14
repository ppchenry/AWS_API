const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");

/**
 * Builds a standardised error response with CORS headers, translated error message, and requestId.
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Dot-separated error key (e.g. 'others.unauthorized')
 * @param {object} event - API Gateway event
 * @returns {object} API Gateway-compatible response object
 */
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

/**
 * Builds a standardised success response with CORS headers.
 * @param {number} statusCode - HTTP status code
 * @param {object} event - API Gateway event
 * @param {object} [data={}] - Additional fields merged into the response body
 * @param {object} [extraHeaders={}] - Extra headers to include
 * @returns {object} API Gateway-compatible response object
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

module.exports = { createErrorResponse, createSuccessResponse };
