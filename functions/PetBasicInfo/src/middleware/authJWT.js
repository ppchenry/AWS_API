/**
 * @fileoverview JWT authentication middleware for the PetBasicInfo Lambda.
 * Provides helpers to verify Bearer tokens from the Authorization header
 * and to gate Lambda routes behind authentication.
 */
const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/response");

/**
 * Verifies the JWT Bearer token attached to an incoming Lambda event.
 *
 * When the `JWT_BYPASS` environment variable is `"true"` a hard-coded
 * developer payload is returned instead of performing real verification.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event whose `Authorization` header will be inspected.
 * @returns {{userId: string, email: string, role: string, [key: string]: any} | null} The decoded JWT payload when the token is valid, or `null` when the token is missing, malformed, or expired.
 * @throws {Error} Re-throws unexpected errors that are not standard JWT verification failures.
 */
function verifyJWT(event) {
  try {
    // ✅ DEV BYPASS — only in non-production environments
    if (process.env.JWT_BYPASS === "true" && process.env.NODE_ENV !== "production") {
      console.log("⚠️ JWT BYPASS ENABLED (non-production)");

      return {
        userId: "dev-user-id",
        email: "dev@test.com",
        role: "developer",
      };
    }
    // Extract Authorization header
    const authHeader =
      event.headers?.Authorization || event.headers?.authorization;

    if (!authHeader) {
      return null;
    }

    // Check if it starts with "Bearer "
    if (!authHeader.startsWith("Bearer ")) {
      return null;
    }

    // Extract token
    const token = authHeader.split(" ")[1];
    if (!token) {
      return null;
    }

    // Verify token using JWT_SECRET (HS256 algorithm)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("JWT_SECRET environment variable is not set");
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(token, jwtSecret);

    // Return decoded token payload (contains userId, userEmail, userRole, etc.)
    return decoded;
  } catch (error) {
    console.error("JWT verification error:", error.message);

    // Return null for invalid/expired tokens (don't throw, let handler decide)
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return null;
    }

    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Middleware that gates a Lambda route behind JWT authentication.
 *
 * Skips verification for OPTIONS (CORS preflight) requests.
 * When the token is valid the decoded user fields are attached directly
 * to the `event` object (`event.user`, `event.userId`, `event.userEmail`,
 * `event.userRole`) and `null` is returned so the caller can continue.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event The Lambda event to authenticate. Mutated in-place on success.
 * @returns {{statusCode: number, headers: Record<string, string>, body: string} | null} A 401 error response when authentication fails, or `null` when the request is authenticated and the caller may proceed.
 */
function authJWT(event) {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return null;
  }

  const user = verifyJWT(event);

  if (!user) {
    return createErrorResponse(
      401,
      "Authentication required. Please provide a valid Authorization header with Bearer token.",
      null,
      event
    );
  }

  // Attach user info to event for use in handler
  event.user = user;
  event.userId = user.userId || user.sub;
  event.userEmail = user.userEmail || user.email;
  event.userRole = user.userRole || user.role;

  return null; // Authentication successful, continue processing
}

module.exports = { authJWT, verifyJWT };
