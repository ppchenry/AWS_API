
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(o => o.trim());

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

function handleOptions(event) {
  console.log("Allowed Origins:", allowedOrigins);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(event),
      body: "",
    };
  }
}

module.exports = { corsHeaders, handleOptions };