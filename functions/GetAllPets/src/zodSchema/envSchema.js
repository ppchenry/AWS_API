const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().url("MONGODB_URI must be a valid connection string"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z.enum(["true", "false"]).default("false"),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required and must not be empty"),
});

module.exports = { envSchema };
