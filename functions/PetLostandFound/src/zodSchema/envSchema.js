const { z } = require("zod");

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required"),
  NODE_ENV: z.string().optional().default("development"),
  JWT_BYPASS: z.string().optional().default("false"),
  AWSACCESSID: z.string().min(1, "AWSACCESSID is required"),
  AWSSECRETKEY: z.string().min(1, "AWSSECRETKEY is required"),
  AWS_BUCKET_BASE_URL: z.string().min(1, "AWS_BUCKET_BASE_URL is required"),
  AWS_BUCKET_NAME: z.string().min(1, "AWS_BUCKET_NAME is required"),
  AWS_BUCKET_REGION: z.string().min(1, "AWS_BUCKET_REGION is required"),
});

module.exports = { envSchema };
