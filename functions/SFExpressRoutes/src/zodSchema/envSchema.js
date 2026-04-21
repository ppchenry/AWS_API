const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "env.errors.missingMongoUri"),
  JWT_SECRET: z.string().min(1, "env.errors.missingJwtSecret"),
  JWT_BYPASS: z.enum(["true", "false"]).default("false"),
  ALLOWED_ORIGINS: z.string().min(1, "env.errors.missingAllowedOrigins"),
  SF_CUSTOMER_CODE: z.string().min(1, "env.errors.missingSfCustomerCode").optional(),
  SF_PRODUCTION_CHECK_CODE: z.string().min(1, "env.errors.missingSfProductionCheckCode").optional(),
  SF_SANDBOX_CHECK_CODE: z.string().optional(),
  SMTP_FROM: z.string().min(1, "env.errors.missingSmtpFrom").optional(),
  SMTP_HOST: z.string().min(1, "env.errors.missingSmtpHost").optional(),
  SMTP_PASS: z.string().min(1, "env.errors.missingSmtpPass").optional(),
  SMTP_PORT: z.string().min(1, "env.errors.missingSmtpPort").optional(),
  SMTP_USER: z.string().min(1, "env.errors.missingSmtpUser").optional(),
  SF_ADDRESS_API_KEY: z.string().min(1, "env.errors.missingSfAddressApiKey").optional(),
});

module.exports = { envSchema };
