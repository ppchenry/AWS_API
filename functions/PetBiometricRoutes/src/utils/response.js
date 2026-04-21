const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");

/**
 * Builds a localized error response with the standard Lambda error shape.
 *
 * @param {number} statusCode
 * @param {string} error
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string }}
 */
function createErrorResponse(statusCode, error, event) {
  const translations = loadTranslations(
    event.cookies?.language || event.queryStringParameters?.lang || "zh"
  );

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

/**
 * Builds a standardized success response with CORS headers.
 *
 * @param {number} statusCode
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event
 * @param {Record<string, any>} [data]
 * @param {Record<string, string>} [extraHeaders]
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string }}
 */
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