const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

/**
 * Builds CORS headers for an allowed request origin.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event
 * @returns {Record<string, string>}
 */
function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const normalizedOrigin = typeof origin === "string" ? origin.trim() : null;

  const isAllowed = normalizedOrigin && allowedOrigins.some(
    (allowedOrigin) => allowedOrigin.toLowerCase() === normalizedOrigin.toLowerCase()
  );

  if (!isAllowed) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": normalizedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key,X-Requested-With",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  };
}

/**
 * Handles OPTIONS preflight requests before auth or business logic runs.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string } | undefined}
 */
function handleOptions(event) {
  if (event.httpMethod !== "OPTIONS") {
    return undefined;
  }

  const headers = corsHeaders(event);
  if (Object.keys(headers).length > 0) {
    return {
      statusCode: 204,
      headers,
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

module.exports = { corsHeaders, handleOptions };