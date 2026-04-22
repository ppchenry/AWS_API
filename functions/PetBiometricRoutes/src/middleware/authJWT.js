const jwt = require("jsonwebtoken");

const { createErrorResponse } = require("../utils/response");
const { logError, logWarn } = require("../utils/logger");

/**
 * Verifies the caller JWT and attaches the decoded identity to the Lambda event.
 * Returns a ready-made error response when auth fails.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any> }} request
 * @returns {import("aws-lambda").APIGatewayProxyResult | null}
 */
function authJWT({ event }) {
  if (event.httpMethod === "OPTIONS") {
    return null;
  }

  try {
    if (process.env.JWT_BYPASS === "true" && process.env.NODE_ENV !== "production") {
      logWarn("JWT bypass enabled in non-production", {
        scope: "middleware.authJWT",
        event,
      });

      _attachUserToEvent(event, {
        userId: "dev-user-id",
        email: "dev@test.com",
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

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
    });

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
 * Maps the decoded token payload onto standard event fields used downstream.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent & Record<string, any>} event
 * @param {Record<string, any>} payload
 * @returns {void}
 */
function _attachUserToEvent(event, payload) {
  event.user = payload;
  event.userId = payload.userId || payload.sub;
  event.userEmail = payload.userEmail || payload.email;
  event.userRole = payload.userRole || payload.role;
  event.ngoId = payload.ngoId;

  event.requestContext = event.requestContext || {};
  event.requestContext.authorizer = payload;
}

module.exports = { authJWT };