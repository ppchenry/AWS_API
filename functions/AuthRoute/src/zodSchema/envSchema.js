const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z.string().optional(),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required"),
  REFRESH_TOKEN_MAX_AGE_SEC: z.coerce.number().int().positive(),
  REFRESH_RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(20),
  REFRESH_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(300),
});

module.exports = { envSchema };
