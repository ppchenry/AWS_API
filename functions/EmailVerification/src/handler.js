/**
 * @fileoverview Orchestrates the EmailVerification Lambda lifecycle.
 * Follows the Canonical Request Lifecycle from REFACTOR_CHECKLIST.md.
 */

// Trigger ENV validation immediately at cold start
require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { validateUserRequest } = require("./middleware/guard");
const { logError } = require("./utils/logger");

/**
 * Paths that do not require a valid JWT.
 * All EmailVerification routes are public (pre-auth flows).
 */
const PUBLIC_RESOURCES = [
  "/account/generate-email-code",
  "/account/generate-email-code-2",
  "/account/verify-email-code",
];

/**
 * Orchestrates the lifecycle of the EmailVerification Lambda.
 *
 * @async
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @param {import("aws-lambda").Context} context
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    // 1. CORS Preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // 2. Authentication & Public Route Check
    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    // 3. Guard Layer (cheap, no DB)
    const validation = await validateUserRequest({ event });
    if (!validation.isValid) return validation.error;

    // 4. DB Connection
    await getReadConnection();

    // 5. Route Dispatch
    return await routeRequest({
      event,
      body: validation.body,
    });
  } catch (error) {
    logError("Unhandled request error", {
      scope: "handler.handleRequest",
      event,
      error,
      extra: {
        awsRequestId: context.awsRequestId,
      },
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };
