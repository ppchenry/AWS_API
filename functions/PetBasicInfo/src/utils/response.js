/**
 * @fileoverview HTTP response builders for Lambda handlers (API Gateway).
 */

const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");
const { logWarn } = require("./logger");

/**
 * Builds a standardized JSON error response with CORS headers.
 *
 * @param {number} statusCode The HTTP status code to return.
 * @param {string} error The translation key or raw error message.
 * @param {import("aws-lambda").APIGatewayProxyEventV2 | import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event used to derive response CORS headers.
 * @returns {{statusCode: number, headers: Record<string, string>, body: string}} Serialized error response.
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
    event.cookies?.language || event.queryStringParameters?.lang || 'zh'
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
 * Matches inline patterns in index.js: { statusCode, headers: { Content-Type, ...corsHeaders(event), ...extra }, body: { success: true, ...data } }.
 *
 * @param {number} statusCode The HTTP status code to return.
 * @param {import("aws-lambda").APIGatewayProxyEventV2 | import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event used to derive response CORS headers.
 * @param {Record<string, any>} [data] Additional JSON fields merged after success: true.
 * @param {Record<string, string>} [extraHeaders] Extra headers merged after Content-Type and CORS (e.g. Set-Cookie).
 * @returns {{statusCode: number, headers: Record<string, string>, body: string}} Serialized success response.
 */
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

module.exports = {
  createErrorResponse,
  createSuccessResponse,
};
