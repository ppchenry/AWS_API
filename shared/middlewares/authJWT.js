/**
 * @fileoverview JWT authentication middleware for the PetBasicInfo Lambda.
 * Provides helpers to verify Bearer tokens from the Authorization header
 * and to gate Lambda routes behind authentication.
 */
const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");

function authJWT(event, translations) {
  if (process.env.JWT_BYPASS === "true" && process.env.NODE_ENV !== "production") {
    event.requestContext = { authorizer: { userId: "dev", role: "admin" } };
    return null;
  }

  const authHeader = event.headers?.Authorization || event.headers?.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return createErrorResponse(401, "Unauthorized", translations, event);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    event.requestContext = event.requestContext || {};
    event.requestContext.authorizer = decoded;
    return null;
  } catch (error) {
    return createErrorResponse(401, "Unauthorized", translations, event);
  }
}

module.exports = { authJWT };