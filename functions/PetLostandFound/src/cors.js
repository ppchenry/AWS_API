const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

/**
 * Builds CORS response headers for the given Lambda event.
 *
 * @param {Record<string, any>} event
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
 *
 * @param {Record<string, any>} event
 * @returns {{statusCode: number, headers: Record<string, string>, body: string}|undefined}
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
