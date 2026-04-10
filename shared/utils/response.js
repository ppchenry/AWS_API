/**
 * @fileoverview HTTP response builder factory shared across Lambda functions.
 * Each Lambda binds response helpers to its own locales directory so
 * translations are resolved correctly without callers needing to pass them.
 *
 * Usage in each Lambda's utils/response.js:
 *
 *   const path = require('path');
 *   const { createResponseHelpers } = require('../../../../shared/utils/response');
 *   module.exports = createResponseHelpers(path.join(__dirname, '..', 'locales'));
 */

const { corsHeaders } = require("../cors");
const { loadTranslations, getTranslation } = require("./i18n");

/**
 * Creates `createErrorResponse` and `createSuccessResponse` helpers bound to
 * the provided locales directory.
 *
 * @param {string} localesDir Absolute path to the Lambda's locales/ directory.
 * @returns {{ createErrorResponse: Function, createSuccessResponse: Function }}
 */
function createResponseHelpers(localesDir) {
  /**
   * Builds a standardized JSON error response with CORS headers.
   * Translations are auto-loaded from the event's language preference.
   *
   * @param {number} statusCode The HTTP status code to return.
   * @param {string} error The translation key or raw error message.
   * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event used to derive CORS headers and language.
   * @returns {{statusCode: number, headers: Record<string, string>, body: string}}
   */
  function createErrorResponse(statusCode, error, event) {
    const lang = event?.cookies?.language || event?.queryStringParameters?.lang || "zh";
    const translations = loadTranslations(lang, localesDir);

    const errorMessage = translations
      ? getTranslation(translations, error)
      : error;

    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(event),
      },
      body: JSON.stringify({
        success: false,
        errorKey: error,
        error: errorMessage,
        ...(event?.awsRequestId ? { requestId: event.awsRequestId } : {}),
      }),
    };
  }

  /**
   * Builds a standardized JSON success response with CORS headers.
   *
   * @param {number} statusCode The HTTP status code to return.
   * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event used to derive CORS headers.
   * @param {Record<string, any>} [data={}] Additional JSON fields merged after `success: true`.
   * @param {Record<string, string>} [extraHeaders={}] Extra headers merged after Content-Type and CORS (e.g. Set-Cookie).
   * @returns {{statusCode: number, headers: Record<string, string>, body: string}}
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

  return { createErrorResponse, createSuccessResponse };
}

module.exports = { createResponseHelpers };
