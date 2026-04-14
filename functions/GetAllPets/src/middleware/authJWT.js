const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");
const { logWarn, logError } = require("../utils/logger");

/**
 * Verifies the JWT from the Authorization header. Attaches decoded user
 * info to the event on success. Skips verification for OPTIONS preflight.
 * @param {object} param0 - Route context
 * @param {object} param0.event - API Gateway event
 * @returns {object|null} Error response if auth fails, or null if auth passes
 */
function authJWT({ event }) {
  // Skip for OPTIONS (CORS preflight)
  if (event.httpMethod === "OPTIONS") return null;

  try {
    // DEV BYPASS — only in non-production
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

    // Extract Header
    const authHeader =
      event.headers?.Authorization || event.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createErrorResponse(401, "others.unauthorized", event);
    }

    // Verify Token
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

    // Attach user info
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
 * Attaches decoded JWT fields to the event for downstream consumption.
 * @param {object} event - API Gateway event (mutated in place)
 * @param {object} payload - Decoded JWT payload
 */
function _attachUserToEvent(event, payload) {
  event.user = payload;
  event.userId = payload.userId || payload.sub;
  event.userEmail = payload.userEmail || payload.email;
  event.userRole = payload.userRole || payload.role;
  event.ngoId = payload.ngoId;
  event.ngoName = payload.ngoName;

  event.requestContext = event.requestContext || {};
  event.requestContext.authorizer = payload;
}

module.exports = { authJWT };
