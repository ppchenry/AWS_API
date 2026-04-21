const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "env.errors.missingMongoUri"),
  JWT_SECRET: z.string().min(1, "env.errors.missingJwtSecret"),
  JWT_BYPASS: z.enum(["true", "false"]).default("false"),
  ALLOWED_ORIGINS: z.string().min(1, "env.errors.missingAllowedOrigins"),
  SF_CUSTOMER_CODE: z.string().min(1, "env.errors.missingSfCustomerCode"),
  SF_PRODUCTION_CHECK_CODE: z.string().min(1, "env.errors.missingSfProductionCheckCode"),
  SF_SANDBOX_CHECK_CODE: z.string().optional(),
  SMTP_FROM: z.string().min(1, "env.errors.missingSmtpFrom"),
  SMTP_HOST: z.string().min(1, "env.errors.missingSmtpHost"),
  SMTP_PASS: z.string().min(1, "env.errors.missingSmtpPass"),
  SMTP_PORT: z.string().min(1, "env.errors.missingSmtpPort"),
  SMTP_USER: z.string().min(1, "env.errors.missingSmtpUser"),
  SF_ADDRESS_API_KEY: z.string().min(1, "env.errors.missingSfAddressApiKey"),
});

module.exports = { envSchema };
