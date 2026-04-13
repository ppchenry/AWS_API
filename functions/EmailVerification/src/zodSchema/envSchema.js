const { z } = require("zod");

/**
 * Environment variable schema for the EmailVerification Lambda.
 * Validated at cold start for fail-fast behavior.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  ALLOWED_ORIGINS: z.string().default("*"),
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),
  SMTP_USER: z.string().min(1, "SMTP_USER is required"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required"),
  REFRESH_TOKEN_MAX_AGE_SEC: z
    .string()
    .min(1, "REFRESH_TOKEN_MAX_AGE_SEC is required"),
});

module.exports = { envSchema };
