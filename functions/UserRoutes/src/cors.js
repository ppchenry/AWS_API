/**
 * @fileoverview CORS helpers for Lambda responses in the UserRoutes function.
 * Builds response headers for allowed origins and handles preflight requests.
 */

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

/**
 * Builds CORS headers for the incoming request origin when it is allowed.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2 | import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event containing request headers.
 * @returns {Record<string, string>} Response headers for CORS handling.
 */
function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;

  const headers = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key,X-Requested-With",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

/**
 * Handles CORS preflight requests by returning a `204 No Content` response.
 * Returns `undefined` for non-OPTIONS requests so the main handler can continue.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2 | import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event containing the HTTP method and headers.
 * @returns {{statusCode: number, headers: Record<string, string>, body: string} | undefined} Preflight response for OPTIONS requests.
 */
function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(event),
      body: "",
    };
  }
}

module.exports = { corsHeaders, handleOptions };
