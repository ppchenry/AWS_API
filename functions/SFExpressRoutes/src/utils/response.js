const { corsHeaders } = require("../cors");
const { getTranslation, loadTranslations } = require("./i18n");
const { logWarn } = require("./logger");

/**
 * Builds a standardized error response with translated error text and CORS headers.
 *
 * @param {number} statusCode
 * @param {string} error
 * @param {import("aws-lambda").APIGatewayProxyEvent & Record<string, any>} event
 * @returns {import("aws-lambda").APIGatewayProxyResult}
 */
const createErrorResponse = (statusCode, error, event) => {
  if (statusCode >= 400 && statusCode < 500) {
    logWarn("Expected client error response", {
      scope: "utils.response.createErrorResponse",
      event,
      extra: { statusCode, errorKey: error },
    });
  }

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
      error: translations ? getTranslation(translations, error) : error,
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
};

/**
 * Builds a standardized success response and merges any extra headers.
 *
 * @param {number} statusCode
 * @param {import("aws-lambda").APIGatewayProxyEvent & Record<string, any>} event
 * @param {Record<string, any>} [data]
 * @param {Record<string, string>} [extraHeaders]
 * @returns {import("aws-lambda").APIGatewayProxyResult}
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
