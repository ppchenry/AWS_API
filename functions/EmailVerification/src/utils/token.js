/**
 * @fileoverview Token utilities for hashing refresh tokens and issuing JWT access tokens.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

/**
 * Generates a SHA-256 hash for a refresh token before persisting it.
 * @param {string} token The raw refresh token.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a cryptographically secure refresh token.
 * @returns {string} Hex-encoded refresh token.
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Issues a JWT access token with custom payload.
 * @param {Object} payload
 * @param {Object} [options]
 * @returns {string}
 */
function issueCustomAccessToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "15m",
    ...options,
    algorithm: "HS256", // always last — cannot be overridden by callers
  });
}

/**
 * Issues a JWT for a regular user (email verification flow).
 * Uses 15-minute expiry matching the original EmailVerification contract.
 * @param {Object} user
 * @returns {string}
 */
function issueUserAccessToken(user) {
  return issueCustomAccessToken({
    userId: user._id,
    userEmail: user.email,
    userRole: user.role,
  });
}

/**
 * Creates and stores a refresh token for a user in the DB.
 * @param {string|Object} userId
 * @returns {Promise<{token: string, expiresAt: Date}>}
 */
async function createRefreshToken(userId) {
  const mongoose = require("mongoose");
  const RefreshTokenModel = mongoose.model("RefreshToken");
  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(
    Date.now() + Number(process.env.REFRESH_TOKEN_MAX_AGE_SEC) * 1000
  );
  await new RefreshTokenModel({
    userId,
    tokenHash: hashToken(newRefreshToken),
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt,
  }).save();
  return { token: newRefreshToken, expiresAt };
}

/**
 * Derives the cookie path from the API Gateway stage.
 * Matches the UserRoutes baseline: scoped to /auth/refresh, the actual
 * refresh-token consumer path in AuthRoute.
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {string}
 */
function getCookiePath(event) {
  const stage = event.requestContext?.stage || "";
  if (stage === "Dev") return "/Dev/auth/refresh";
  if (stage === "Production") return "/Production/auth/refresh";
  return "/auth/refresh";
}

/**
 * Builds a Set-Cookie header value for the refresh token.
 * Uses SameSite=Strict per checklist baseline (matching UserRoutes).
 * @param {string} refreshToken
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {string}
 */
function buildRefreshCookie(refreshToken, event) {
  const cookiePath = getCookiePath(event);
  return `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${process.env.REFRESH_TOKEN_MAX_AGE_SEC}`;
}

module.exports = {
  hashToken,
  generateRefreshToken,
  issueCustomAccessToken,
  issueUserAccessToken,
  createRefreshToken,
  getCookiePath,
  buildRefreshCookie,
};
