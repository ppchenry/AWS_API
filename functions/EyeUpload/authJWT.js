import jwt from "jsonwebtoken";

/**
 * JWT Authentication Middleware for Lambda Functions
 * Verifies JWT token from Authorization header and attaches user info to event
 * 
 * @param {Object} event - Lambda event object
 * @returns {Object|null} - Returns user info if authenticated, null if not authenticated
 * @throws {Error} - Throws error if token is invalid or expired
 */
function verifyJWT(event) {
  try {
    // Extract Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    
    if (!authHeader) {
      return null;
    }

    // Check if it starts with "Bearer "
    if (!authHeader.startsWith("Bearer ")) {
      return null;
    }

    // Extract token
    const token = authHeader.split(" ")[1];
    if (!token) {
      return null;
    }

    // Verify token using JWT_SECRET (HS256 algorithm)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("JWT_SECRET environment variable is not set");
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(token, jwtSecret);
    
    // Return decoded token payload (contains userId, userEmail, userRole, etc.)
    return decoded;
  } catch (error) {
    console.error("JWT verification error:", error.message);
    
    // Return null for invalid/expired tokens (don't throw, let handler decide)
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return null;
    }
    
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Middleware function to authenticate requests
 * Returns early response if authentication fails
 * 
 * @param {Object} event - Lambda event object
 * @returns {Object|null} - Returns error response if auth fails, null if auth succeeds
 */
function authJWT(event) {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return null;
  }

  const user = verifyJWT(event);
  
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        success: false,
        error: "Authentication required",
        error_message: "Invalid or missing JWT token. Please provide a valid Authorization header with Bearer token.",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  // Attach user info to event for use in handler
  event.user = user;
  event.userId = user.userId || user.sub;
  event.userEmail = user.userEmail || user.email;
  event.userRole = user.userRole || user.role;

  return null; // Authentication successful, continue processing
}

export {
  verifyJWT,
  authJWT,
};