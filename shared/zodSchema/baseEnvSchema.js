const { z } = require('zod');

/**
 * Base environment variable schema shared across all Lambda functions.
 * Each Lambda extends this with its own function-specific variables:
 *
 *   const { baseEnvSchema } = require('../../shared/zodSchema/baseEnvSchema');
 *   const envSchema = baseEnvSchema.extend({ MY_VAR: z.string().min(1) });
 */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().url("MONGODB_URI must be a valid connection string"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_BYPASS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  ALLOWED_ORIGINS: z.string().default('*'),
});

module.exports = { baseEnvSchema };
