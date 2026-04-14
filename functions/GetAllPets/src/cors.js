const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

/**
 * Builds CORS headers if the request origin is in the allowlist.
 * @param {object} event - API Gateway event
 * @returns {object} CORS headers object, or empty object if origin is not allowed
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
 * Handles OPTIONS preflight requests. Returns 204 with CORS headers
 * for allowed origins, or 403 for disallowed/missing origins.
 * @param {object} event - API Gateway event
 * @returns {object|undefined} Response object for OPTIONS, or undefined for other methods
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Origin not allowed" }),
    };
  }
}

module.exports = { corsHeaders, handleOptions };
