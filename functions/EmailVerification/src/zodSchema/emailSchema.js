const { z } = require("zod");

/**
 * Schema for POST /account/generate-email-code
 * Validates the email field for code generation requests.
 */
const generateCodeSchema = z.object({
  email: z
    .string({ required_error: "missingEmailParams" })
    .min(1, "missingEmailParams")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "invalidEmailFormat"),
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
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "invalidEmailFormat"),
  resetCode: z
    .string({ required_error: "missingParams" })
    .min(1, "missingParams")
    .regex(/^\d{6}$/, "invalidResetCodeFormat"),
  lang: z.string().optional(),
});

module.exports = {
  generateCodeSchema,
  verifyCodeSchema,
};
