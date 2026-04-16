const { z } = require("zod");

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
  AWS_BUCKET_BASE_URL: z.string().min(1),
  AWS_BUCKET_NAME: z.string().min(1),
  AWS_BUCKET_REGION: z.string().min(1),
  AWSACCESSID: z.string().min(1),
  AWSSECRETKEY: z.string().min(1),
  VM_PUBLIC_IP: z.string().min(1),
  DOCKER_IMAGE: z.string().min(1),
  HEATMAP: z.string().min(1),
  VM_BREED_PUBLIC_IP: z.string().min(1),
  BREED_DOCKER_IMAGE: z.string().min(1),
  NODE_ENV: z.string().optional().default("production"),
  JWT_BYPASS: z.string().optional().default("false"),
});

module.exports = { envSchema };
