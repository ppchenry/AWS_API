/**
 * @fileoverview Standardized JWT Authentication Middleware.
 * Provides consistent token verification and identity mapping across all Lambdas.
 *
 * Depends on:
 *   - shared/utils/response.js  (createErrorResponse)
 *   - shared/utils/logger.js    (logWarn, logError)
 *
 * NOTE: Each Lambda's response.js must be wired to the correct cors.js before
 * this middleware can be used. The easiest way is to require this file after
 * the Lambda's own response/cors are already loaded, or to pass a custom
 * createErrorResponse via options in the future.
 */
const jwt = require("jsonwebtoken");
const { logWarn, logError } = require("../utils/logger");

/**
 * Verifies the JWT and attaches the identity to the event.
 *
 * @param {Object} params
 * @param {import("aws-lambda").APIGatewayProxyEvent} params.event
 * @param {function} params.createErrorResponse - The Lambda's own createErrorResponse function.
 * @returns {import("aws-lambda").APIGatewayProxyResult | null} 401/500 error response or null to continue.
 */
function authJWT({ event, createErrorResponse }) {
  // 1. Skip for OPTIONS (CORS preflight)
  if (event.httpMethod === "OPTIONS") return null;

  try {
    // 2. DEV BYPASS — only in non-production
    if (process.env.JWT_BYPASS === "true" && process.env.NODE_ENV !== "production") {
      logWarn("JWT bypass enabled in non-production", {
        scope: "middleware.authJWT",
        event,
      });
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
      return createErrorResponse(401, "others.unauthorized", event);
    }

    // 4. Verify Token
    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logError("JWT secret not configured", {
        scope: "middleware.authJWT",
        event,
      });
      return createErrorResponse(500, "others.internalError", event);
    }

    const decoded = jwt.verify(token, jwtSecret);

    // 5. Attach user info to event for downstream use (Guards/Services)
    _attachUserToEvent(event, decoded);

    return null; // Success
  } catch (error) {
    logWarn("JWT verification failed", {
      scope: "middleware.authJWT",
      event,
      error,
    });
    return createErrorResponse(401, "others.unauthorized", event);
  }
}

/**
 * Internal helper to map JWT payload fields to standard event properties.
 * Maps both standard 'sub' and custom 'userId' keys for flexibility.
 * @private
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
