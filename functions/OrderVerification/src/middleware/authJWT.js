const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");
const { logWarn, logError } = require("../utils/logger");

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
      return createErrorResponse(401, "others.unauthorized", event);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logError("JWT secret not configured", {
        scope: "middleware.authJWT",
        event,
      });
      return createErrorResponse(500, "others.internalError", event);
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
    return createErrorResponse(401, "others.unauthorized", event);
  }
}

function _attachUserToEvent(event, decoded) {
  event.user = decoded;
  event.userId = decoded.userId || decoded.sub;
  event.userRole = decoded.userRole || decoded.role;
}

module.exports = { authJWT };
