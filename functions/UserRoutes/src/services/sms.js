const mongoose = require("mongoose");
const crypto = require("crypto");
const { issueUserAccessToken, createRefreshToken, buildRefreshCookie } = require("../utils/token");
const { verifySmsCodeSchema, smsCodeSchema } = require("../zodSchema/smsSchema");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logInfo, logError } = require("../utils/logger");
const { normalizePhone } = require("../utils/validators");
const { enforceRateLimit } = require("../utils/rateLimit");

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const client =
  twilioAccountSid && twilioAuthToken
    ? require("twilio")(twilioAccountSid, twilioAuthToken)
    : null;

/**
 * Sends an SMS verification code to the given phone number via Twilio.
 * @param {RouteContext} routeContext
 */
async function generateSmsCode({ event, body }) {
  try {
    if (!client) {
      logError("Twilio client not configured", {
        scope: "services.sms.generateSmsCode",
        event,
      });
      return createErrorResponse(503, "others.serviceUnavailable", event);
    }
    const parseResult = smsCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error, "verification.invalidPhoneFormat"), event);
    }
    const phoneNumber = normalizePhone(parseResult.data.phoneNumber);

    const rateLimit = await enforceRateLimit({
      event,
      action: "sms-send",
      identifier: phoneNumber,
      limit: 5,
      windowSec: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    await client.verify.v2.services(twilioVerifyServiceSid).verifications.create({
      to: phoneNumber,
      channel: "sms",
    });

    return createSuccessResponse(201, event, {
      message: "SMS code sent successfully",
    });
  } catch (e) {
    logError("Failed to generate SMS code", {
      scope: "services.sms.generateSmsCode",
      event,
      error: e,
      extra: {
        phoneNumber: body?.phoneNumber,
      },
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Verifies an SMS code with Twilio.
 * - Public (no user in DB): store verification record, return verified + isNewUser: true.
 * - Public (user exists): login — issue token.
 * - Authenticated (event.userId): link phone to current account.
 * @param {RouteContext} routeContext
 */
async function verifySmsCode({ event, body }) {
  try {
    if (!client) {
      logError("Twilio client not configured", {
        scope: "services.sms.verifySmsCode",
        event,
      });
      return createErrorResponse(503, "others.serviceUnavailable", event);
    }
    const User = mongoose.model("User");
    
    // 1. Validation
    const parseResult = verifySmsCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const phoneNumber = normalizePhone(parseResult.data.phoneNumber);
    const { code } = parseResult.data;

    const rateLimit = await enforceRateLimit({
      event,
      action: "sms-verify",
      identifier: phoneNumber,
      limit: 10,
      windowSec: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    // 2. Twilio Check
    const { status } = await client.verify.v2
      .services(twilioVerifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    // 3. Handle Failures Early
    if (status !== "approved") {
      const errorMap = {
        pending: "verification.codeIncorrect",
        canceled: "verification.codeExpired",
        expired: "verification.codeExpired"
      };
      return createErrorResponse(400, errorMap[status] || "verification.failed", event);
    }

    // 4. Store SMS verification record (proof for register endpoint).
    const SmsVerificationCode = mongoose.model("SmsVerificationCode");
    const verificationHash = crypto.createHash("sha256").update(`${phoneNumber}:${Date.now()}`).digest("hex");
    await SmsVerificationCode.findOneAndUpdate(
      { _id: phoneNumber },
      {
        $set: {
          codeHash: verificationHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          consumedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // 5a. Authenticated user — on-demand phone linking.
    if (event.userId) {
      const currentUser = await User.findOne({ _id: event.userId, deleted: false }).lean();
      if (!currentUser) {
        return createErrorResponse(401, "others.unauthorized", event);
      }

      const phoneOwner = await User.findOne({
        phoneNumber,
        deleted: false,
        _id: { $ne: currentUser._id },
      }).lean();
      if (phoneOwner) {
        return createErrorResponse(409, "phoneRegister.userExist", event);
      }

      await User.findOneAndUpdate(
        { _id: currentUser._id },
        { $set: { phoneNumber, verified: true } }
      );

      logInfo("Phone linked successfully", {
        scope: "services.sms.verifySmsCode",
        event,
        extra: { phoneNumber, userId: currentUser._id },
      });

      return createSuccessResponse(200, event, {
        message: "Phone number verified successfully",
        verified: true,
        isNewUser: false,
        userId: currentUser._id,
        role: currentUser.role,
        isVerified: true,
        linked: { phoneNumber },
      });
    }

    // 5b. Public flow — check if user exists.
    const user = await User.findOne({ phoneNumber, deleted: false }).lean();

    // 5c. New user — return verified status, frontend collects username then calls register.
    if (!user) {
      logInfo("SMS verified for new user (registration required)", {
        scope: "services.sms.verifySmsCode",
        event,
        extra: { phoneNumber },
      });

      return createSuccessResponse(200, event, {
        message: "Phone number verified successfully",
        verified: true,
        isNewUser: true,
      });
    }

    // 5d. Existing user — login flow.
    if (!user.verified) {
      await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { verified: true } }
      );
    }

    const token = issueUserAccessToken(user);
    const { token: newRefreshToken } = await createRefreshToken(user._id);

    logInfo("SMS verification successful — login", {
      scope: "services.sms.verifySmsCode",
      event,
      extra: { phoneNumber, userId: user._id },
    });

    return createSuccessResponse(200, event, {
      message: "Login successful",
      verified: true,
      isNewUser: false,
      userId: user._id,
      role: user.role,
      isVerified: true,
      token,
    }, {
      "Set-Cookie": buildRefreshCookie(newRefreshToken, event),
    });

  } catch (e) {
    logError("Failed to verify SMS code", {
      scope: "services.sms.verifySmsCode",
      event,
      error: e,
      extra: {
        phoneNumber: body?.phoneNumber,
      },
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { generateSmsCode, verifySmsCode };
