/**
 * Creates and stores a refresh token for a user in the DB.
 * @param {string|Object} userId - The user's ID.
 * @returns {Promise<{token: string, expiresAt: Date}>}
 */
async function createRefreshToken(userId) {
  const mongoose = require("mongoose");
  const RefreshTokenModel = mongoose.model("RefreshToken");
  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + Number(process.env.REFRESH_TOKEN_MAX_AGE_SEC) * 1000);
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
 * @fileoverview Token utilities for hashing refresh tokens and issuing JWT access tokens.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

/**
 * Generates a SHA-256 hash for a refresh token before persisting it.
 *
 * @param {string} token The raw refresh token.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a cryptographically secure refresh token.
 *
 * @returns {string} Hex-encoded refresh token.
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Issues a JWT access token for a user with custom payload.
 *
 * @param {Object} payload - The payload to sign (userId, userRole, etc).
 * @param {Object} [options] - Optional jwt sign options.
 * @returns {string} Signed JWT access token.
 */
function issueCustomAccessToken(payload, options = {}) {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "15m",
      ...options,
    }
  );
}

/**
 * Issues a JWT for a regular user.
 * @param {Object} user
 */
function issueUserAccessToken(user) {
  return issueCustomAccessToken({ 
    userId: user._id, 
    userEmail: user.email,
    userRole: user.role 
  });
}

/**
 * Issues a JWT for an NGO user.
 * @param {Object} user
 * @param {Object} ngo
 */
function issueNgoAccessToken(user, ngo) {
  return issueCustomAccessToken({
    userId: user._id,
    userEmail: user.email,
    userRole: user.role,
    ngoId: ngo._id,
    ngoName: ngo.name,
  });
}

/**
 * Derives the refresh-token cookie path from the API Gateway stage.
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 * @returns {string}
 */
function getCookiePath(event) {
  const stage = event.requestContext?.stage || "";
  if (stage === "Dev") return "/Dev/auth/refresh";
  if (stage === "Production") return "/Production/auth/refresh";
  return "/auth/refresh";
}

/**
 * Builds a standardized Set-Cookie header value for the refresh token.
 * @param {string} refreshToken
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
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
  issueNgoAccessToken,
  createRefreshToken,
  getCookiePath,
  buildRefreshCookie,
};
