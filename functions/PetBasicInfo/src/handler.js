// Trigger ENV validation immediately
require("./config/env");

const { getReadConnection } = require("./config/db");
const { validateRequest } = require("./middleware/guard");
const { createErrorResponse } = require("./utils/response");
const { routeRequest } = require("./router");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { logError } = require("./utils/logger");

/**
 * All routes in this Lambda are protected.
 * There are no public resources that can bypass JWT auth.
 */
const PUBLIC_RESOURCES = [];

/**
 * Orchestrates the lifecycle of a single Lambda invocation.
 *
 * @async
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

    // 2. Authentication
    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    // 3. Infrastructure Setup (DB)
    await getReadConnection();

    // 4. Guard — body parse, ID format, pet existence, ownership (spec: DB → Guard)
    const guardResult = await validateRequest({ event });
    if (!guardResult.isValid) return guardResult.error;

    // 5. Routing (services handle rate limiting internally)
    return await routeRequest({
      event,
      pet: guardResult.data,
      body: guardResult.body,
    });
  } catch (error) {
    logError("Unhandled PetBasicInfo request error", {
      scope: "handler.handleRequest",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };