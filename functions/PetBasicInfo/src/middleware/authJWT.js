/**
 * @fileoverview Standardized JWT Authentication Middleware.
 * Provides consistent token verification and identity mapping across all Lambdas.
 */
const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");
const { logWarn, logError } = require("../utils/logger");

/**
 * Verifies the JWT and attaches the identity to the event.
 * * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {import("aws-lambda").APIGatewayProxyResult | null} 401 error or null to continue
 */
function authJWT({ event }) {
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
      return createErrorResponse(401, "common.unauthorized", event);
    }

    // 4. Verify Token
    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logError("JWT secret not configured", {
        scope: "middleware.authJWT",
        event,
      });
      return createErrorResponse(500, "common.internalError", event);
    }

    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });

    // 5. Attach user info to event for downstream use (Guards/Services)
    _attachUserToEvent(event, decoded);

    return null; // Success
  } catch (error) {
    logWarn("JWT verification failed", {
      scope: "middleware.authJWT",
      event,
      error,
    });
    // Explicitly handle expired tokens if you want a different key, 
    // otherwise default to unauthorized.
    return createErrorResponse(401, "common.unauthorized", event);
  }
}

/**
 * Internal helper to map JWT payload fields to standard event properties.
 * Attaches userId, userEmail, userRole, and ngoId directly to the event so
 * downstream guards and services can read them without re-decoding the token.
 *
 * @private
 * @param {import('aws-lambda').APIGatewayProxyEvent & Record<string, any>} event
 * @param {{ userId?: string, sub?: string, userEmail?: string, email?: string, userRole?: string, role?: string, ngoId?: string }} payload - Decoded JWT payload.
 */
function _attachUserToEvent(event, payload) {
  event.user = payload;
  event.userId = payload.userId || payload.sub;
  event.userEmail = payload.userEmail || payload.email;
  event.userRole = payload.userRole || payload.role;
  event.ngoId = payload.ngoId;

  // Also attach to requestContext to mimic AWS Authorizer behavior
  event.requestContext = event.requestContext || {};
  event.requestContext.authorizer = payload;
}

module.exports = { authJWT };