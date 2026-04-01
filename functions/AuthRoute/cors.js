const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
console.log("ALLOWED ORIGINS: ", allowedOrigins);

function corsHeaders(event) {
  // Handle different header formats from API Gateway
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || headers['origin'] || headers['Origin'];
  console.log("RECEIVED ORIGIN: ", origin);
  console.log("ALL HEADERS: ", JSON.stringify(headers, null, 2));
  console.log("Event headers type:", typeof headers);

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

  if (isAllowed && normalizedOrigin) {
    // CRITICAL: Always return a SINGLE origin value, never comma-separated
    // This ensures we override any API Gateway CORS headers that might be incorrectly set
    const headers = {
      // Explicitly set to single origin value to override API Gateway headers
      "Access-Control-Allow-Origin": String(normalizedOrigin).split(',')[0].trim(), // Take only first value if somehow multiple
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    console.log("RETURNING CORS HEADERS: ", headers);
    console.log("Access-Control-Allow-Origin value type:", typeof headers["Access-Control-Allow-Origin"]);
    console.log("Access-Control-Allow-Origin value:", JSON.stringify(headers["Access-Control-Allow-Origin"]));
    return headers;
  }

  // Return empty object if origin not allowed (don't set wildcard when credentials are involved)
  console.log("ORIGIN NOT ALLOWED - RETURNING EMPTY OBJECT");
  return {};
}

function handleOptions(event) {
  if (event.httpMethod === 'OPTIONS') {
    console.log("OPTIONS request received");
    console.log("Event object:", JSON.stringify(event, null, 2));
    
    try {
      const origin = event.headers?.origin || event.headers?.Origin;
      const normalizedOrigin = origin ? origin.trim() : null;
      console.log("Extracted origin:", normalizedOrigin);
      
      // For preflight requests, we MUST return CORS headers even if origin is not in allowed list
      // Otherwise browser will show "No 'Access-Control-Allow-Origin' header is present"
      // However, we can only return the specific origin (not wildcard) when credentials are involved
      
      let corsHeadersObj = {};
      try {
        corsHeadersObj = corsHeaders(event);
      } catch (corsError) {
        console.error("Error in corsHeaders:", corsError);
        // Fallback: create basic CORS headers
        if (normalizedOrigin) {
          corsHeadersObj = {
            "Access-Control-Allow-Origin": normalizedOrigin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          };
        }
      }
      
      // If origin is allowed, return CORS headers with credentials
      if (Object.keys(corsHeadersObj).length > 0) {
        console.log("OPTIONS: Returning 204 with CORS headers for allowed origin");
        return {
          statusCode: 204,
          headers: corsHeadersObj,
          body: "",
        };
      }
      
      // If origin not in allowed list but origin is provided, still return CORS headers for preflight
      // This allows the preflight to succeed, but the actual request will be rejected later
      if (normalizedOrigin) {
        console.log("OPTIONS: Origin not in allowed list, but returning CORS headers for preflight");
        return {
          statusCode: 204,
          headers: {
            "Access-Control-Allow-Origin": normalizedOrigin, // Specific origin, not wildcard
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          },
          body: "",
        };
      }
      
      // No origin header - return basic CORS headers
      console.log("OPTIONS: No origin header provided");
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*", // Can use wildcard when no origin and no credentials
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        body: "",
      };
    } catch (error) {
      console.error("Error in handleOptions:", error);
      // Fallback response with CORS headers
      const origin = event.headers?.origin || event.headers?.Origin || "*";
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": origin === "*" ? "*" : origin,
          "Access-Control-Allow-Credentials": origin !== "*" ? "true" : undefined,
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        body: "",
      };
    }
  }
}

/**
 * Ensures Access-Control-Allow-Origin header contains only a single origin value
 * This prevents issues when API Gateway incorrectly adds multiple comma-separated origins
 * @param {Object} headers - Headers object that may contain CORS headers
 * @returns {Object} - Headers object with single origin value
 */
function ensureSingleOrigin(headers) {
  if (headers && headers["Access-Control-Allow-Origin"]) {
    const originValue = headers["Access-Control-Allow-Origin"];
    // If somehow multiple values exist (comma-separated), take only the first one
    headers["Access-Control-Allow-Origin"] = String(originValue).split(',')[0].trim();
  }
  return headers;
}

module.exports = { corsHeaders, handleOptions, ensureSingleOrigin };
