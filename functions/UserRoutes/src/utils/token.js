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
 * Issues a short-lived JWT access token for an authenticated user.
 *
 * @param {{_id: {toString: function(): string}, email: string}} user The authenticated user payload.
 * @returns {string} Signed JWT access token.
 */
function issueAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "15m",
    }
  );
}

module.exports = {
  hashToken,
  generateRefreshToken,
  issueAccessToken,
};
