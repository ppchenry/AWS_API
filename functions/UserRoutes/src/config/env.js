const { envSchema } = require("../zodSchema/envSchema");
const { logError } = require("../utils/logger");

// Validate process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logError("Invalid environment variables", {
    scope: "config.env",
    extra: {
      validation: parsed.error.format(),
    },
  });
  throw new Error("Invalid environment configuration. Check logs for details.");
}

/**
 * @type {z.infer<typeof envSchema>}
 */
module.exports = parsed.data;