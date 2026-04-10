/**
 * @fileoverview Environment variable validation factory shared across Lambda functions.
 * Validates process.env against a caller-supplied Zod schema and returns the
 * parsed, type-safe config object.
 *
 * Usage in each Lambda's config/env.js:
 *
 *   const { createEnvConfig } = require('../../../../shared/config/env');
 *   const { envSchema } = require('../zodSchema/envSchema');
 *   module.exports = createEnvConfig(envSchema);
 */

const { logError } = require("../utils/logger");

/**
 * Validates process.env against the provided Zod schema and returns the parsed data.
 * Throws on validation failure so the Lambda fails fast at cold-start rather than
 * surfacing missing config at request time.
 *
 * @template T
 * @param {import("zod").ZodType<T>} schema A Zod schema to validate process.env against.
 * @returns {T} The validated, type-safe environment config object.
 * @throws {Error} When process.env fails schema validation.
 */
function createEnvConfig(schema) {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    logError("Invalid environment variables", {
      scope: "config.env",
      extra: {
        validation: parsed.error.format(),
      },
    });
    throw new Error("Invalid environment configuration. Check logs for details.");
  }

  return parsed.data;
}

module.exports = { createEnvConfig };
