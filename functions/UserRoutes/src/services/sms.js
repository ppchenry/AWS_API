const mongoose = require("mongoose");
const { issueUserAccessToken, createRefreshToken } = require("../utils/token");
const { verifySmsCodeSchema, smsCodeSchema } = require("../zodSchema/smsSchema");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const client =
  twilioAccountSid && twilioAuthToken
    ? require("twilio")(twilioAccountSid, twilioAuthToken)
    : null;

async function generateSmsCode({ event, translations, body }) {
  try {
    const User = mongoose.model("User");
    const parseResult = smsCodeSchema.safeParse(body);
    if (!parseResult.success) {
      const zodError = parseResult.error.errors[0];
      return createErrorResponse(400, zodError.message || "verification.invalidPhoneFormat", translations, event);
    }
    const { phoneNumber } = parseResult.data;


    const existingUser = await User.findOne({ phoneNumber, deleted: false });
    await client.verify.v2.services(twilioVerifyServiceSid).verifications.create({
      to: phoneNumber,
      channel: "sms",
    });

    if (existingUser) {
      return createSuccessResponse(201, event, {
        newUser: false,
        message: translations ? translations["verification.generateSMSSuccess"] : "SMS code sent successfully",
      });
    }
    return createSuccessResponse(201, event, { newUser: true });
  } catch (e) {
    return createErrorResponse(500, e.message, translations, event);
  }
}

async function verifySmsCode({ event, translations, body }) {
  try {
    const User = mongoose.model("User");
    
    // 1. Validation
    const parseResult = verifySmsCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, parseResult.error.errors[0].message, translations, event);
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
      return createErrorResponse(400, errorMap[status] || "verification.failed", translations, event);
    }

    // 4. Approved Logic
    const user = await User.findOne({ phoneNumber, deleted: false }).lean();

    // New User Flow
    if (!user) {
      return createSuccessResponse(201, event, {
        message: translations?.["registration.successful"] || "Registration successful",
        u_id: "new user",
        role: "user",
        token: "",
      });
    }

    // Existing User Flow
    const token = issueUserAccessToken(user);
    const { token: newRefreshToken } = await createRefreshToken(user._id);

    return createSuccessResponse(201, event, {
      success: true,
      message: translations?.["login.successful"] || "Login successful",
      u_id: user._id,
      role: user.role,
      token,
    }, {
      "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${process.env.REFRESH_TOKEN_MAX_AGE_SEC}`,
    });

  } catch (e) {
    return createErrorResponse(500, e.message, translations, event);
  }
}

module.exports = { generateSmsCode, verifySmsCode };
