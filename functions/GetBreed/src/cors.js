const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

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

function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Origin not allowed" }),
    };
  }
}

module.exports = { corsHeaders, handleOptions };
