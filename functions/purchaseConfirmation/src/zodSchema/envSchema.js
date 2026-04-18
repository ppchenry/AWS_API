const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required"),
  // S3
  AWS_BUCKET_BASE_URL: z.string().min(1, "AWS_BUCKET_BASE_URL is required"),
  AWS_BUCKET_NAME: z.string().min(1, "AWS_BUCKET_NAME is required"),
  AWS_BUCKET_REGION: z.string().min(1, "AWS_BUCKET_REGION is required"),
  AWSACCESSID: z.string().min(1, "AWSACCESSID is required"),
  AWSSECRETKEY: z.string().min(1, "AWSSECRETKEY is required"),
  // SMTP
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().min(1, "SMTP_USER is required"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required"),
  SMTP_FROM: z.string().min(1, "SMTP_FROM is required"),
  // WhatsApp Meta API
  WHATSAPP_BEARER_TOKEN: z.string().min(1, "WHATSAPP_BEARER_TOKEN is required"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, "WHATSAPP_PHONE_NUMBER_ID is required"),
  // URL shortener (optional, falls back to full URL)
  CUTTLY_API_KEY: z.string().optional(),
});

module.exports = { envSchema };
