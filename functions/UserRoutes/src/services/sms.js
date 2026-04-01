const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { connectToMongoDB, getReadConnection } = require("../config/db");
const { generateRefreshToken, hashToken } = require("../utils/token");
const { isValidPhoneNumber } = require("../utils/validators");
const { loadTranslations, getTranslation } = require("../helpers/i18n");
const { corsHeaders } = require("../cors");
const { tryParseJsonBody } = require("../utils/parseBody");

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const client =
  twilioAccountSid && twilioAuthToken
    ? require("twilio")(twilioAccountSid, twilioAuthToken)
    : null;

async function generateSmsCode(event) {
  try {
    const parsed = tryParseJsonBody(event);
    if (!parsed.ok) {
      const lang = event.cookies?.language || "zh";
      const t = loadTranslations(lang);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        body: JSON.stringify({
          error: getTranslation(t, "others.invalidJSON"),
          code: "INVALID_JSON",
        }),
      };
    }
    const readConn = await getReadConnection();
    const UserRead = readConn.model("User");
    const body = parsed.body;
    const lang = event.cookies?.language || body.lang?.toLowerCase() || "zh";
    const t = loadTranslations(lang);
    const phoneNumber = body.phoneNumber;

    if (!client || !twilioVerifyServiceSid) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: "SMS verification service is not configured",
          code: "TWILIO_NOT_CONFIGURED",
        }),
      };
    }

    if (!phoneNumber) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: getTranslation(t, "verification.missingParams"),
          code: "MISSING_PARAMS",
        }),
      };
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: getTranslation(t, "verification.invalidPhoneFormat"),
          code: "INVALID_PHONE",
        }),
      };
    }

    const existingUser = await UserRead.find({ phoneNumber });
    await client.verify.v2.services(twilioVerifyServiceSid).verifications.create({
      to: phoneNumber,
      channel: "sms",
    });

    if (existingUser.length > 0) {
      return {
        statusCode: 201,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          newUser: false,
          message: getTranslation(t, "verification.generateSMSSuccess"),
        }),
      };
    }
    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(event),
      },
      body: JSON.stringify({ newUser: true }),
    };
  } catch (e) {
    console.error("Error:", e);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(event),
      },
      body: JSON.stringify({ error: e.message }),
    };
  }
}

async function verifySmsCode(event) {
  try {
    const parsed = tryParseJsonBody(event);
    if (!parsed.ok) {
      const lang = event.cookies?.language || "zh";
      const t = loadTranslations(lang);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        body: JSON.stringify({
          error: getTranslation(t, "others.invalidJSON"),
          code: "INVALID_JSON",
        }),
      };
    }
    const readConn = await getReadConnection();
    const UserRead = readConn.model("User");
    const body = parsed.body;
    const lang = event.cookies?.language || body.lang?.toLowerCase() || "zh";
    const t = loadTranslations(lang);
    const phoneNumber = body.phoneNumber;
    const code = body.code;

    if (!client || !twilioVerifyServiceSid) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: "SMS verification service is not configured",
          code: "TWILIO_NOT_CONFIGURED",
        }),
      };
    }

    if (!phoneNumber) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: getTranslation(t, "verification.missingParams"),
          code: "MISSING_PARAMS",
        }),
      };
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: getTranslation(t, "verification.invalidPhoneFormat"),
          code: "INVALID_PHONE",
        }),
      };
    }

    if (!code) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: getTranslation(t, "verification.missingCodeParams"),
          code: "MISSING_CODE",
        }),
      };
    }

    const verificationCheck = await client.verify.v2
      .services(twilioVerifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    const status = verificationCheck.status;
    const user = await UserRead.findOne({ phoneNumber });

    if (status === "approved") {
      if (!user) {
        return {
          statusCode: 201,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(event),
          },
          body: JSON.stringify({
            message: getTranslation(t, "registration.successful"),
            u_id: "new user",
            role: "user",
            token: "",
          }),
        };
      }
      const token = jwt.sign(
        { userId: user._id, userRole: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      const newRefreshToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await connectToMongoDB();
      const RefreshTokenModel = mongoose.model("RefreshToken");
      await new RefreshTokenModel({
        userId: user._id,
        tokenHash: hashToken(newRefreshToken),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt,
      }).save();

      return {
        statusCode: 201,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
          "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${14 * 24 * 60 * 60}`,
        },
        body: JSON.stringify({
          success: true,
          message: getTranslation(t, "login.successful"),
          u_id: user._id,
          role: user.role,
          token,
        }),
      };
    }
    if (status === "pending") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: getTranslation(t, "verification.codeIncorrect"),
          code: "CODE_INCORRECT",
        }),
      };
    }
    if (status === "canceled" || status === "expired") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event),
        },
        body: JSON.stringify({
          error: getTranslation(t, "verification.codeExpired"),
          code: "CODE_EXPIRED",
        }),
      };
    }
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(event),
      },
      body: JSON.stringify({
        error: getTranslation(t, "verification.failed"),
        code: "VERIFICATION_FAILED",
      }),
    };
  } catch (e) {
    console.error("Error:", e.message);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(event),
      },
      body: JSON.stringify({ error: e.message }),
    };
  }
}

module.exports = { generateSmsCode, verifySmsCode };
