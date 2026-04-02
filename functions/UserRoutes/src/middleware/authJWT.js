/**
 * @fileoverview JWT authentication middleware for UserRoutes Lambda.
 * Verifies the Authorization header on every non-OPTIONS request.
 */

const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");

/**
 * Verifies the JWT token from the Authorization header.
 * Returns an error response if the token is missing or invalid,
 * or `null` if authentication succeeds.
 *
 * JWT_BYPASS=true skips verification in non-production environments only.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @param {Record<string, any> | null} translations
 * @returns {{statusCode: number, headers: Record<string, string>, body: string} | null}
 */
function authJWT(event, translations) {
  if (
    process.env.JWT_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return null;
  }

  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return createErrorResponse(401, "others.unauthorized", translations, event);
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    event.requestContext = event.requestContext || {};
    event.requestContext.authorizer = decoded;
    return null;
  } catch {
    return createErrorResponse(401, "others.unauthorized", translations, event);
  }
}

module.exports = { authJWT };
