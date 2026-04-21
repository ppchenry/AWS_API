const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const normalizedOrigin = origin ? origin.trim() : null;

  const isAllowed = normalizedOrigin && allowedOrigins.some(
    (allowed) => allowed.toLowerCase() === normalizedOrigin.toLowerCase()
  );

  if (!isAllowed) return {};

  return {
    "Access-Control-Allow-Origin": normalizedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  };
}

function handleOptions(event) {
  if (event.httpMethod !== "OPTIONS") return undefined;

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
    body: JSON.stringify({
      success: false,
      errorKey: "others.originNotAllowed",
      error: "Origin not allowed",
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
}

module.exports = { corsHeaders, handleOptions };
