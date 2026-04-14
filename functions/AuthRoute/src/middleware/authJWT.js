/**
 * @fileoverview JWT Authentication Middleware for AuthRoute.
 * Follows the canonical lifecycle — runs before the guard and DB layers.
 * Since all AuthRoute resources are public (/auth/refresh uses cookie-based
 * refresh tokens, not JWTs), the handler ignores auth errors for public routes.
 */
const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");
const { logWarn, logError } = require("../utils/logger");

/**
 * Verifies the JWT and attaches the identity to the event.
 *
 * @param {Object} params
 * @param {import("aws-lambda").APIGatewayProxyEvent} params.event
 * @returns {import("aws-lambda").APIGatewayProxyResult | null} 401/500 error response or null to continue.
 */
function authJWT({ event }) {
  if (event.httpMethod === "OPTIONS") return null;

  try {
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

    const authHeader = event.headers?.Authorization || event.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createErrorResponse(401, "others.unauthorized", event);
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logError("JWT secret not configured", {
        scope: "middleware.authJWT",
        event,
      });
      return createErrorResponse(500, "others.internalError", event);
    }

    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });

    _attachUserToEvent(event, decoded);

    return null;
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
 * Maps JWT payload fields to standard event properties.
 * @private
 */
function _attachUserToEvent(event, payload) {
  event.user = payload;
  event.userId = payload.userId || payload.sub;
  event.userEmail = payload.userEmail || payload.email;
  event.userRole = payload.userRole || payload.role;

  event.requestContext = event.requestContext || {};
  event.requestContext.authorizer = payload;
}

module.exports = { authJWT };
