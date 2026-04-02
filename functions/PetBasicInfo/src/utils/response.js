/**
 * @fileoverview HTTP response helpers for Lambda handlers.
 */

const { corsHeaders } = require("../cors");
const { getTranslation } = require("./i18n");

/**
 * Builds a standardized JSON error response with CORS headers.
 *
 * @param {number} statusCode The HTTP status code to return.
 * @param {string} error The translation key or raw error message.
 * @param {Record<string, any> | undefined | null} translations Translation dictionary used to resolve the error message.
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event used to derive response CORS headers.
 * @returns {{statusCode: number, headers: Record<string, string>, body: string}} Serialized error response.
 */
const createErrorResponse = (statusCode, error, translations, event) => {
  const defaultHeaders = {
    "Content-Type": "application/json",
    ...corsHeaders(event),
  };

  const errorMessage = translations
    ? getTranslation(translations, error)
    : error;

  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify({
      success: false,
      error: errorMessage,
    }),
  };
};

/**
 * Builds a standardized JSON success response with CORS headers.
 *
 * @param {string} messageKey The translation key for the success message.
 * @param {Record<string, any>} data Additional fields to include in the response body alongside `message`.
 * @param {Record<string, any> | undefined | null} translations Translation dictionary used to resolve the message.
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event used to derive response CORS headers.
 * @returns {{statusCode: number, headers: Record<string, string>, body: string}} Serialized success response.
 */
const createSuccessResponse = (messageKey, data, translations, event) => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(event),
    },
    body: JSON.stringify({
      success: true,
      message: translations
        ? getTranslation(translations, messageKey)
        : messageKey,
      ...data,
    }),
  };
};

module.exports = {
  createErrorResponse,
  createSuccessResponse,
};
