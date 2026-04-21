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

  throw new Error("Invalid environment configuration. Check logs for details.");
}

module.exports = parsed.data;