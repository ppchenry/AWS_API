const { envSchema } = require("../zodSchema/envSchema");

// Validate process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  throw new Error("Invalid environment configuration. Check logs for details.");
}

/**
 * @type {z.infer<typeof envSchema>}
 */
module.exports = parsed.data;