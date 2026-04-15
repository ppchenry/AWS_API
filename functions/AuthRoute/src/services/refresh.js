const mongoose = require("mongoose");
const env = require("../config/env");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");
const {
  hashToken,
  createRefreshToken,
  issueUserAccessToken,
  issueNgoAccessToken,
  buildRefreshCookie,
  readRefreshTokenFromEvent,
} = require("../utils/token");

async function buildAccessTokenForUser(user) {
  if (user.role !== "ngo") {
    return issueUserAccessToken(user);
  }

  const NgoUserAccess = mongoose.model("NgoUserAccess");
  const ngoUserAccess = await NgoUserAccess.findOne({
    userId: user._id,
    isActive: true,
  })
    .select("ngoId")
    .lean();

  if (!ngoUserAccess?.ngoId) {
    return null;
  }

  const NGO = mongoose.model("NGO");
  const ngo = await NGO.findOne({ _id: ngoUserAccess.ngoId })
    .select("_id name")
    .lean();

  if (!ngo) {
    return null;
  }

  return issueNgoAccessToken(user, ngo);
}

async function refreshSession({ event }) {
  try {
    const refreshTokenResult = readRefreshTokenFromEvent(event);
    const rateLimitIdentifier = refreshTokenResult.token
      ? hashToken(refreshTokenResult.token)
      : "anonymous";

    const rateLimit = await enforceRateLimit({
      event,
      action: "auth.refresh",
      identifier: rateLimitIdentifier,
      limit: env.REFRESH_RATE_LIMIT_LIMIT,
      windowSec: env.REFRESH_RATE_LIMIT_WINDOW_SEC,
    });

    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    if (refreshTokenResult.errorKey) {
      return createErrorResponse(401, refreshTokenResult.errorKey, event);
    }

    const RefreshToken = mongoose.model("RefreshToken");
    const tokenHash = hashToken(refreshTokenResult.token);

    const record = await RefreshToken.findOneAndDelete({ tokenHash })
      .select("_id userId expiresAt")
      .lean();

    if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
      return createErrorResponse(401, "authRefresh.invalidSession", event);
    }

    const User = mongoose.model("User");
    const user = await User.findOne({ _id: record.userId, deleted: false })
      .select("_id email role")
      .lean();

    if (!user) {
      return createErrorResponse(401, "authRefresh.invalidSession", event);
    }

    const { token: newRefreshToken } = await createRefreshToken(record.userId);
    const accessToken = await buildAccessTokenForUser(user);

    if (!accessToken) {
      return createErrorResponse(401, "authRefresh.invalidSession", event);
    }

    const cookieHeader = buildRefreshCookie(newRefreshToken, event);

    return createSuccessResponse(
      200,
      event,
      {
        accessToken,
        id: user._id.toString(),
      },
      {
        "Set-Cookie": cookieHeader,
      }
    );
  } catch (error) {
    logError("Failed to refresh session", {
      scope: "services.refresh.refreshSession",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  refreshSession,
};
