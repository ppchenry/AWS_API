const { z } = require('zod');

/**
 * Define the schema for environment variables.
 * This ensures types are correct and required fields exist.
 * All variables are validated at startup for fail-fast behavior.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().url("MONGODB_URI must be a valid connection string"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  ALLOWED_ORIGINS: z.string().default('*'),
  TWILIO_ACCOUNT_SID: z.string().min(1, "TWILIO_ACCOUNT_SID is required"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN is required"),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1, "TWILIO_VERIFY_SERVICE_SID is required"),
  REFRESH_TOKEN_MAX_AGE_SEC: z.string().min(1, "REFRESH_TOKEN_MAX_AGE_SEC is required")
});

module.exports = { envSchema };