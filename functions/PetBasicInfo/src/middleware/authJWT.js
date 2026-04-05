/**
 * @fileoverview Standardized JWT Authentication Middleware.
 * Provides consistent token verification and identity mapping across all Lambdas.
 */
const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");

/**
 * Verifies the JWT and attaches the identity to the event.
 * * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @param {Object} translations - Loaded i18n object
 * @returns {import("aws-lambda").APIGatewayProxyResult | null} 401 error or null to continue
 */
function authJWT({ event, translations }) {
  // 1. Skip for OPTIONS (CORS preflight)
  if (event.httpMethod === "OPTIONS") return null;

  try {
    // 2. DEV BYPASS — only in non-production
    if (process.env.JWT_BYPASS === "true" && process.env.NODE_ENV !== "production") {
      console.log("⚠️ JWT BYPASS ENABLED");
      const devUser = {
        userId: "dev-user-id",
        email: "dev@test.com",
        role: "developer",
      };
      _attachUserToEvent(event, devUser);
      return null;
    }

    // 3. Extract Header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createErrorResponse(401, "others.unauthorized", translations, event);
    }

    // 4. Verify Token
    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error("CRITICAL: JWT_SECRET not configured");
      return createErrorResponse(500, "others.internalError", translations, event);
    }

    const decoded = jwt.verify(token, jwtSecret);

    // 5. Attach user info to event for downstream use (Guards/Services)
    _attachUserToEvent(event, decoded);

    return null; // Success
  } catch (error) {
    console.error("JWT verification error:", error.message);
    // Explicitly handle expired tokens if you want a different key, 
    // otherwise default to unauthorized.
    return createErrorResponse(401, "others.unauthorized", translations, event);
  }
}

/**
 * Internal helper to map JWT payload fields to standard event properties.
 * Maps both standard 'sub' and custom 'userId' keys for flexibility.
 * * @private
 */
function _attachUserToEvent(event, payload) {
  event.user = payload;
  event.userId = payload.userId || payload.sub;
  event.userEmail = payload.userEmail || payload.email;
  event.userRole = payload.userRole || payload.role;
  
  // Also attach to requestContext to mimic AWS Authorizer behavior
  event.requestContext = event.requestContext || {};
  event.requestContext.authorizer = payload;
}

module.exports = { authJWT };