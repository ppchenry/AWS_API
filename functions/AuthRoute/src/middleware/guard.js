const { createErrorResponse } = require("../utils/response");

/**
 * Lightweight request guard for AuthRoute.
 * AuthRoute's refresh endpoint uses cookies — not a JSON body — so there is
 * no body to parse or path parameters to validate.  This guard exists to
 * satisfy the canonical lifecycle ordering (OPTIONS → authJWT → guard → DB → router).
 *
 * @param {Object} params
 * @param {import("aws-lambda").APIGatewayProxyEvent} params.event
 * @returns {{ isValid: true } | { isValid: false, error: any }}
 */
function validateAuthRequest({ event }) {
  return { isValid: true };
}

module.exports = { validateAuthRequest };
