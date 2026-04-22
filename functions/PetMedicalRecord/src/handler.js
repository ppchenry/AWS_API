// Trigger ENV validation immediately
require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validateUserRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { logError } = require("./utils/logger");

/**
 * All routes in this Lambda are protected.
 * @type {string[]}
 */
const PUBLIC_RESOURCES = [];

/**
 * Orchestrates the lifecycle of the PetMedicalRecord Lambda.
 *
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

    // 2. JWT Authentication
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
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { handleRequest };
