/**
 * @fileoverview Service for verifying email codes and issuing auth tokens.
 *
 * Anti-enumeration (C7/C8): all verification failures (no record, expired,
 * wrong code, already-consumed) return a single generic "emailVerification.errors.verificationFailed"
 * error. Only malformed input returns 400 with a specific Zod key.
 *
 * Replay prevention: uses findOneAndUpdate on the EmailVerificationCode
 * collection with codeHash + consumedAt:null in the filter. On success the
 * update atomically sets consumedAt, so a concurrent second request with the
 * same code finds zero matching documents.
 *
 * Verification-first flow:
 * - If user exists in DB → login: issue token immediately.
 * - If user does NOT exist → return verified: true, isNewUser: true.
 *   Frontend then collects username and calls register endpoint.
 * - If authenticated (event.userId) → on-demand: link email to account.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logInfo, logError } = require("../utils/logger");
const { normalizeEmail } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { verifyCodeSchema } = require("../zodSchema/emailSchema");
const { enforceRateLimit } = require("../utils/rateLimit");
const { issueUserAccessToken, createRefreshToken, buildRefreshCookie } = require("../utils/token");
const { loadTranslations, getTranslation } = require("../utils/i18n");

/**
 * Verifies the email code and issues JWT + refresh token on success.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent, body: Record<string, any> }} ctx
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function verifyEmailCode({ event, body }) {
  const SCOPE = "services.verifyCode.verifyEmailCode";

  try {
    // 1. Rate limiting — sensitive verification flow (M14)
    const rateLimit = await enforceRateLimit({
      event,
      action: "verify-email-code",
      identifier: body?.email || "anonymous",
      limit: 10,
      windowSec: 300,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // 2. Zod validation — malformed input still returns specific 400
    const parseResult = verifyCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error),
        event
      );
    }

    // 3. Normalization
    const email = normalizeEmail(parseResult.data.email);
    const resetCode = parseResult.data.resetCode.trim();
    const lang = parseResult.data.lang || "zh";
    const t = loadTranslations(lang);

    // C7/C8: uniform failure for all non-success states
    const genericFail = () =>
      createErrorResponse(400, "emailVerification.errors.verificationFailed", event);

    // 4. Hash the submitted code for comparison
    const codeHash = crypto.createHash("sha256").update(resetCode).digest("hex");

    // 5. Atomically consume the verification record.
    //    _id = normalized email, so lookup is by primary key — no custom index
    //    needed. Filter: matching _id + codeHash + not consumed + not expired.
    //    Update: set consumedAt to now.
    //    If no document matches, either the code is wrong, expired, already
    //    consumed, or no record exists. All return the same generic failure.
    const EmailVerificationCode = mongoose.model("EmailVerificationCode");
    const consumed = await EmailVerificationCode.findOneAndUpdate(
      {
        _id: email,
        codeHash,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { consumedAt: new Date() } },
      { new: true }
    );

    if (!consumed) return genericFail();

    // 6. Code verified — check if user exists.
    const User = mongoose.model("User");

    // 6a. Authenticated user — on-demand email linking.
    if (event.userId) {
      const currentUser = await User.findOne({ _id: event.userId, deleted: false }).lean();
      if (!currentUser) {
        return createErrorResponse(401, "common.unauthorized", event);
      }

      const emailOwner = await User.findOne({
        email,
        deleted: false,
        _id: { $ne: currentUser._id },
      }).lean();
      if (emailOwner) {
        return createErrorResponse(409, "emailVerification.errors.emailAlreadyLinked", event);
      }

      await User.findOneAndUpdate(
        { _id: currentUser._id },
        { $set: { email, verified: true } }
      );

      logInfo("Email linked successfully", {
        scope: SCOPE,
        event,
        extra: { email, userId: currentUser._id },
      });

      return createSuccessResponse(200, event, {
        message: getTranslation(t, "emailVerification.success.verifySuccessful"),
        verified: true,
        isNewUser: false,
        userId: currentUser._id,
        role: currentUser.role,
        isVerified: true,
        linked: { email },
      });
    }

    // 6b. Public flow — check if user exists in DB.
    const user = await User.findOne({ email, deleted: false })
      .select("_id email role verified")
      .lean();

    // 6c. New user — return verified status, frontend collects username then calls register.
    if (!user) {
      logInfo("Email verified for new user (registration required)", {
        scope: SCOPE,
        event,
        extra: { email },
      });

      return createSuccessResponse(200, event, {
        message: getTranslation(t, "emailVerification.success.verifySuccessful"),
        verified: true,
        isNewUser: true,
      });
    }

    // 6d. Existing user — login flow.
    if (!user.verified) {
      await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { verified: true } }
      );
    }

    // 7. Issue JWT access token (15m expiry)
    const token = issueUserAccessToken(user);

    // 8. Issue refresh token
    const { token: refreshToken } = await createRefreshToken(user._id);
    const cookieHeader = buildRefreshCookie(refreshToken, event);

    logInfo("Email verification successful — login", {
      scope: SCOPE,
      event,
      extra: { email, userId: user._id },
    });

    // 9. Success response.
    return createSuccessResponse(
      200,
      event,
      {
        message: getTranslation(t, "emailVerification.success.verifySuccessful"),
        verified: true,
        isNewUser: false,
        userId: user._id,
        role: user.role,
        isVerified: true,
        token,
      },
      { "Set-Cookie": cookieHeader }
    );
  } catch (error) {
    logError("Failed to verify email code", {
      scope: SCOPE,
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { verifyEmailCode };
