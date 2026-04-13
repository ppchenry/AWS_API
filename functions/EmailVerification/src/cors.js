/**
 * @fileoverview CORS handling for the EmailVerification Lambda.
 * Reads allowed origins from the ALLOWED_ORIGINS environment variable and
 * returns appropriate CORS headers based on the incoming request origin.
 */

/**
 * Allowed origins parsed once at module load from the ALLOWED_ORIGINS env var.
 * @type {string[]}
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

/**
 * Builds CORS response headers for the given Lambda event.
 * Compares the incoming `Origin` header against the allowed origins list
 * (case-insensitive) and returns the matching CORS headers, or an empty
 * object when the origin is not allowed.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event
 * @returns {Record<string, string>}
 */
function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const normalizedOrigin = origin ? origin.trim() : null;

  const isAllowed =
    normalizedOrigin &&
    allowedOrigins.some(
      (allowed) => allowed.toLowerCase() === normalizedOrigin.toLowerCase()
    );

  if (isAllowed) {
    return {
      "Access-Control-Allow-Origin": normalizedOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
  }

  return {};
}

/**
 * Handles CORS preflight (OPTIONS) requests.
 * Returns a 204 response with CORS headers when the origin is allowed,
 * or a 403 response when the origin is not permitted.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event
 * @returns {{statusCode: number, headers: Record<string, string>, body: string} | undefined}
 */
function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
    const corsHeadersObj = corsHeaders(event);

    if (Object.keys(corsHeadersObj).length > 0) {
      return {
        statusCode: 204,
        headers: corsHeadersObj,
        body: "",
      };
    }

    return {
      statusCode: 403,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Origin not allowed" }),
    };
  }
}

module.exports = { corsHeaders, handleOptions };
