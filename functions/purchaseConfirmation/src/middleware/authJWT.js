const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");
const { logWarn, logError } = require("../utils/logger");

function authJWT({ event }) {
  if (event.httpMethod === "OPTIONS") return null;

  try {
    // DEV BYPASS — blocked in production
    if (process.env.JWT_BYPASS === "true" && process.env.NODE_ENV !== "production") {
      logWarn("JWT bypass enabled in non-production", {
        scope: "middleware.authJWT",
        event,
      });
      _attachUserToEvent(event, { userId: "dev-user-id", email: "dev@test.com", role: "admin" });
      return null;
    }

    const authHeader = event.headers?.Authorization || event.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createErrorResponse(401, "common.unauthorized", event);
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logError("JWT_SECRET not configured", { scope: "middleware.authJWT", event });
      return createErrorResponse(500, "common.internalError", event);
    }

    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    _attachUserToEvent(event, decoded);
    return null;
  } catch (error) {
    logWarn("JWT verification failed", { scope: "middleware.authJWT", event, error });
    return createErrorResponse(401, "common.unauthorized", event);
  }
}

function _attachUserToEvent(event, payload) {
  event.user = payload;
  event.userId = payload.userId || payload.sub;
  event.userEmail = payload.userEmail || payload.email;
  event.userRole = payload.userRole || payload.role;
}

module.exports = { authJWT };
