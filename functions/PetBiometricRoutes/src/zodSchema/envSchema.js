const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  BUSINESS_MONGODB_URI: z.string().min(1, "BUSINESS_MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z.enum(["true", "false"]).default("false"),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required"),
  FACEID_API: z.string().min(1, "FACEID_API is required"),
  AWS_BUCKET_NAME: z.string().min(1, "AWS_BUCKET_NAME is required"),
  AWS_BUCKET_BASE_URL: z.string().min(1, "AWS_BUCKET_BASE_URL is required"),
  AWS_BUCKET_REGION: z.string().min(1, "AWS_BUCKET_REGION is required"),
  AWSACCESSID: z.string().min(1, "AWSACCESSID is required"),
  AWSSECRETKEY: z.string().min(1, "AWSSECRETKEY is required"),
});

module.exports = { envSchema };