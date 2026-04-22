const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");
const { logWarn } = require("./logger");

/**
 * Builds a standardized JSON error response with CORS headers.
 *
 * @param {number} statusCode
 * @param {string} error The translation key or raw error message.
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {{statusCode: number, headers: Record<string, string>, body: string}}
 */
const createErrorResponse = (statusCode, error, event) => {
  if (statusCode >= 400 && statusCode < 500) {
    logWarn("Expected client error response", {
      scope: "utils.response.createErrorResponse",
      event,
      extra: { statusCode, errorKey: error },
    });
  }

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
 * Builds a standardized JSON success response with CORS headers.
 *
 * @param {number} statusCode
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @param {Record<string, any>} [data]
 * @param {Record<string, string>} [extraHeaders]
 * @returns {{statusCode: number, headers: Record<string, string>, body: string}}
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
