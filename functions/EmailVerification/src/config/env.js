const { envSchema } = require("../zodSchema/envSchema");
const { logError } = require("../utils/logger");

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logError("Invalid environment variables", {
    scope: "config.env",
    extra: {
      validation: parsed.error.format(),
    },
  });
  throw new Error(
    "Invalid environment configuration. Check logs for details."
  );
}

/**
 * Validated environment variables.
 * @type {import("zod").infer<typeof envSchema>}
 */
module.exports = parsed.data;
