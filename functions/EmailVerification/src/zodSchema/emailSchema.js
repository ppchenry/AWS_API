const { z } = require("zod");

/**
 * Schema for POST /account/generate-email-code
 * Validates the email field for code generation requests.
 */
const generateCodeSchema = z.object({
  email: z
    .string({ required_error: "emailVerification.errors.missingEmailParams" })
    .min(1, "emailVerification.errors.missingEmailParams")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "emailVerification.errors.invalidEmailFormat"),
  lang: z.string().optional(),
});

/**
 * Schema for POST /account/verify-email-code
 * Validates the email and resetCode fields for verification requests.
 */
const verifyCodeSchema = z.object({
  email: z
    .string({ required_error: "missingParams" })
    .min(1, "missingParams")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "emailVerification.errors.invalidEmailFormat"),
  resetCode: z
    .string({ required_error: "missingParams" })
    .min(1, "missingParams")
    .regex(/^\d{6}$/, "emailVerification.errors.invalidResetCodeFormat"),
  lang: z.string().optional(),
});

module.exports = {
  generateCodeSchema,
  verifyCodeSchema,
};
