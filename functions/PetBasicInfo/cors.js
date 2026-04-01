const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
console.log("ALLOWED ORIGINS: ", allowedOrigins);

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  console.log("RECEIVED ORIGIN: ", origin);
  console.log("ALL HEADERS: ", JSON.stringify(event.headers, null, 2));

  // Normalize origin for comparison (remove trailing slashes, handle case)
  const normalizedOrigin = origin ? origin.trim() : null;
  console.log("NORMALIZED ORIGIN: ", normalizedOrigin);
  
  // Check if origin is in allowed list (case-insensitive comparison)
  const isAllowed = normalizedOrigin && allowedOrigins.some(
    allowed => {
      const match = allowed.toLowerCase() === normalizedOrigin.toLowerCase();
      console.log(`Comparing "${allowed.toLowerCase()}" with "${normalizedOrigin.toLowerCase()}": ${match}`);
      return match;
    }
  );

  console.log("IS ALLOWED: ", isAllowed);

  if (isAllowed) {
    const headers = {
      "Access-Control-Allow-Origin": normalizedOrigin, // Use specific origin, not wildcard
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    console.log("RETURNING CORS HEADERS: ", headers);
    return headers;
  }

  // Return empty object if origin not allowed (don't set wildcard when credentials are involved)
  console.log("ORIGIN NOT ALLOWED - RETURNING EMPTY OBJECT");
  return {};
}

function handleOptions(event) {
  if (event.httpMethod === 'OPTIONS') {
    console.log("OPTIONS request received");
    const corsHeadersObj = corsHeaders(event);
    
    // If origin is allowed, return CORS headers with credentials
    if (Object.keys(corsHeadersObj).length > 0) {
      console.log("OPTIONS: Returning 204 with CORS headers for allowed origin");
      return {
        statusCode: 204,
        headers: corsHeadersObj,
        body: "",
      };
    }
    
    // If origin not allowed, reject preflight
    // IMPORTANT: Do NOT return wildcard '*' when credentials are involved
    console.log("OPTIONS: Origin not allowed - rejecting preflight");
    return {
      statusCode: 403,
      headers: {
        "Content-Type": "application/json",
        // Do not set Access-Control-Allow-Origin header when origin is not allowed
        // This prevents API Gateway from adding a wildcard
      },
      body: JSON.stringify({ error: "Origin not allowed" }),
    };
  }
}

module.exports = { corsHeaders, handleOptions };