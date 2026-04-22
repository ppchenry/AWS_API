/**
 * @fileoverview Service for generating and sending email verification codes.
 * Merged from the legacy /generate-email-code and /generate-email-code-2 endpoints.
 *
 * Anti-enumeration (C7/C8): returns a uniform success response regardless of
 * whether the email maps to an existing account.
 *
 * C6 compliance: does NOT create or upsert any User record. Verification codes
 * are stored in the dedicated EmailVerificationCode collection, keyed by email.
 * User creation occurs only after successful verification in verifyCode.js.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logInfo, logError } = require("../utils/logger");
const { normalizeEmail } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { generateCodeSchema } = require("../zodSchema/emailSchema");
const { enforceRateLimit } = require("../utils/rateLimit");
const { loadTranslations, getTranslation } = require("../utils/i18n");

/**
 * Module-level SMTP transporter — created once per Lambda container, reused on warm invocations.
 * Nodemailer createTransport is synchronous and cheap to construct, but pools connections
 * across calls, so module-level placement avoids repeated instantiation overhead.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Generates a 6-digit verification code, stores it in the dedicated
 * EmailVerificationCode collection (replacing any prior unconsumed code
 * for the same email), and emails it to the user.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent, body: Record<string, any> }} ctx
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function generateEmailCode({ event, body }) {
  const SCOPE = "services.generateCode.generateEmailCode";

  try {
    // 1. Rate limiting — public code-dispatch flow (M14)
    const rateLimit = await enforceRateLimit({
      event,
      action: "generate-email-code",
      identifier: body?.email || "anonymous",
      limit: 5,
      windowSec: 300,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // 2. Zod validation
    const parseResult = generateCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error),
        event
      );
    }

    // 3. Normalization
    const email = normalizeEmail(parseResult.data.email);
    const lang = parseResult.data.lang || "zh";
    const t = loadTranslations(lang);

    // 4. Generate 6-digit code + 5-minute expiry
    const expiresAt = new Date(Date.now() + 300_000);
    const randomNumber = crypto.randomInt(0, 1_000_000);
    const sixDigitString = ("000000" + randomNumber).slice(-6);
    const codeHash = crypto.createHash("sha256").update(sixDigitString).digest("hex");

    // 5. Store verification code in dedicated collection.
    //    _id = normalized email guarantees one record per email via MongoDB's
    //    built-in _id uniqueness — no custom index required.
    //    Upsert overwrites codeHash/expiresAt/consumedAt on every generate.
    //    No User record is touched (C6 compliance).
    const EmailVerificationCode = mongoose.model("EmailVerificationCode");
    await EmailVerificationCode.findOneAndUpdate(
      { _id: email },
      {
        $set: {
          codeHash,
          expiresAt,
          consumedAt: null,
        },
      },
      { upsert: true }
    );

    // 6. Prepare localized email content
    const isZh = lang === "zh";
    const html = isZh
      ? `您的驗證碼 <b>${sixDigitString}</b><br>此驗證碼有效期限為 5 分鐘`
      : `Your verification code is <b>${sixDigitString}</b><br>The code would be valid for 5 minutes`;
    const subject = isZh
      ? "Pet Pet Club - 帳戶驗證碼"
      : "Pet Pet Club - Account Verification Code";

    // 7. Send using module-level transporter
    try {
      await transporter.sendMail({
        from: '"Pet Pet Club (Phealth)" <support@petpetclub.com.hk>',
        to: email,
        subject,
        html,
      });
    } catch (smtpError) {
      // The verification record is already written. If SMTP fails, the code
      // exists in the DB but the user never receives it. They can retry.
      // This is an honest non-transactional gap — we do not pretend otherwise.
      logError("Failed to send verification email", {
        scope: SCOPE,
        event,
        error: smtpError,
        extra: { email },
      });
      return createErrorResponse(503, "emailVerification.errors.emailServiceUnavailable", event);
    }

    logInfo("Verification email sent", {
      scope: SCOPE,
      event,
      extra: { email },
    });

    // 8. Uniform success — C7/C8: do not reveal whether account existed.
    return createSuccessResponse(200, event, {
      message: getTranslation(t, "emailVerification.success.generateSuccessful"),
    });
  } catch (error) {
    logError("Failed to generate email code", {
      scope: SCOPE,
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { generateEmailCode };
