const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");
const { logWarn, logError } = require("../utils/logger");

/**
 * Verifies the bearer token and attaches the relevant claims to the event.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {import("aws-lambda").APIGatewayProxyResult|null}
 */
function authJWT({ event }) {
  if (event.httpMethod === "OPTIONS") return null;

  try {
    if (process.env.JWT_BYPASS === "true" && process.env.NODE_ENV !== "production") {
      logWarn("JWT bypass enabled in non-production", {
        scope: "middleware.authJWT",
        event,
      });

      _attachUserToEvent(event, {
        userId: "dev-user-id",
        role: "developer",
      });
      return null;
    }

    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createErrorResponse(401, "common.unauthorized", event);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logError("JWT secret not configured", {
        scope: "middleware.authJWT",
        event,
      });
      return createErrorResponse(500, "common.internalError", event);
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    _attachUserToEvent(event, decoded);
    return null;
  } catch (error) {
    logWarn("JWT verification failed", {
      scope: "middleware.authJWT",
      event,
      error,
    });
    return createErrorResponse(401, "common.unauthorized", event);
  }
}

/**
 * Copies the JWT identity claims used by downstream middleware and services.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent & Record<string, any>} event
 * @param {Record<string, any>} decoded
 * @returns {void}
 */
function _attachUserToEvent(event, decoded) {
  event.user = decoded;
  event.userId = decoded.userId || decoded.sub;
  event.userEmail = decoded.userEmail || decoded.email;
  event.userRole = decoded.userRole || decoded.role;
}

module.exports = { authJWT };
