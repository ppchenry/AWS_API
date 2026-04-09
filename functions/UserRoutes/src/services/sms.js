const mongoose = require("mongoose");
const { issueUserAccessToken, createRefreshToken, buildRefreshCookie } = require("../utils/token");
const { verifySmsCodeSchema, smsCodeSchema } = require("../zodSchema/smsSchema");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");

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
    const User = mongoose.model("User");
    const parseResult = smsCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error, "verification.invalidPhoneFormat"), event);
    }
    const { phoneNumber } = parseResult.data;


    const existingUser = await User.findOne({ phoneNumber, deleted: false }).lean();
    await client.verify.v2.services(twilioVerifyServiceSid).verifications.create({
      to: phoneNumber,
      channel: "sms",
    });

    if (existingUser) {
      return createSuccessResponse(201, event, {
        newUser: false,
        message: "SMS code sent successfully",
      });
    }
    return createSuccessResponse(201, event, { newUser: true });
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
 * Verifies an SMS code with Twilio. Issues JWT + refresh token for existing users,
 * or signals a new-user flow for unregistered phone numbers.
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
    const { phoneNumber, code } = parseResult.data;

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

    // 4. Approved Logic
    const user = await User.findOne({ phoneNumber, deleted: false }).lean();

    // New User Flow
    if (!user) {
      return createSuccessResponse(201, event, {
        message: "Registration successful",
        userId: "new user",
        role: "user",
        token: "",
      });
    }

    // Existing User Flow
    const token = issueUserAccessToken(user);
    const { token: newRefreshToken } = await createRefreshToken(user._id);

    return createSuccessResponse(201, event, {
      message: "Login successful",
      userId: user._id,
      role: user.role,
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
