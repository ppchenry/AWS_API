// Trigger ENV validation immediately at cold start
require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { validateRequest } = require("./middleware/guard");
const { logError } = require("./utils/logger");

/**
 * Paths that do not require a valid JWT.
 * All routes in this Lambda are protected (auth required).
 * The original code had zero auth — this is a security fix per C1.
 */
const PUBLIC_RESOURCES = [];

/**
 * Orchestrates the lifecycle of the PetLostandFound Lambda.
 *
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 * @param {import('aws-lambda').Context} context
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>}
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
    const validation = await validateRequest({ event });
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
