const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z.enum(["true", "false"]).default("false"),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required"),
  WHATSAPP_BEARER_TOKEN: z.string().min(1, "WHATSAPP_BEARER_TOKEN is required").optional(),
});

module.exports = { envSchema };
