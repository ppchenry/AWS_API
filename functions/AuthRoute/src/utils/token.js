const mongoose = require("mongoose");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

function issueCustomAccessToken(payload, options = {}) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "15m",
    ...options,
    algorithm: "HS256",
  });
}

function issueUserAccessToken(user) {
  return issueCustomAccessToken({
    userId: user._id.toString(),
    userEmail: user.email,
    userRole: user.role,
  });
}

async function createRefreshToken(userId) {
  const RefreshToken = mongoose.model("RefreshToken");
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_MAX_AGE_SEC * 1000);

  await new RefreshToken({
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt,
  }).save();

  return { token, expiresAt };
}

function getCookiePath(event) {
  const stage = event.requestContext?.stage || "";
  if (stage === "Dev") return "/Dev/auth/refresh";
  if (stage === "Production") return "/Production/auth/refresh";
  return "/auth/refresh";
}

function buildRefreshCookie(refreshToken, event) {
  return `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=${getCookiePath(event)}; Max-Age=${env.REFRESH_TOKEN_MAX_AGE_SEC}`;
}

function parseCookieString(cookieString) {
  return cookieString
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[name] = value;
      return cookies;
    }, {});
}

function readRefreshTokenFromEvent(event) {
  if (Array.isArray(event.cookies) && event.cookies.length > 0) {
    const cookieMap = parseCookieString(event.cookies.join("; "));
    if (cookieMap.refreshToken) {
      return { token: cookieMap.refreshToken, errorKey: null };
    }
    return { token: null, errorKey: "authRefresh.invalidRefreshTokenCookie" };
  }

  const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
  if (!cookieHeader) {
    return { token: null, errorKey: "authRefresh.missingRefreshToken" };
  }

  const cookieMap = parseCookieString(cookieHeader);
  if (!cookieMap.refreshToken) {
    return { token: null, errorKey: "authRefresh.invalidRefreshTokenCookie" };
  }

  return { token: cookieMap.refreshToken, errorKey: null };
}

module.exports = {
  hashToken,
  generateRefreshToken,
  issueCustomAccessToken,
  issueUserAccessToken,
  createRefreshToken,
  getCookiePath,
  buildRefreshCookie,
  readRefreshTokenFromEvent,
};
