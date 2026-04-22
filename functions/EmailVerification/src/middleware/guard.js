/**
 * @fileoverview Request guard for the EmailVerification Lambda.
 * Parses JSON bodies and rejects malformed/empty requests before DB connection.
 * No RBAC or self-access checks needed — all routes are public pre-auth flows.
 */

const { createErrorResponse } = require("../utils/response");

/**
 * Validates incoming requests: JSON parse and empty-body check.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} params
 * @returns {Promise<{ isValid: boolean, error?: any, body?: Record<string, any> | null }>}
 */
async function validateUserRequest({ event }) {
  const { body, httpMethod } = event;
  const method = httpMethod?.toUpperCase();

  // JSON Body Parse
  let parsedBody = null;
  if (typeof body === "string" && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.invalidJSON", event),
      };
    }
  }

  // Empty body check for POST (all EmailVerification routes require a body)
  if (
    method === "POST" &&
    (!parsedBody || Object.keys(parsedBody).length === 0)
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.missingParams", event),
    };
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validateUserRequest };
