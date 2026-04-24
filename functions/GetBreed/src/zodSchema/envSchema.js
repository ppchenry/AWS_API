const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required and must not be empty"),
});

module.exports = { envSchema };
