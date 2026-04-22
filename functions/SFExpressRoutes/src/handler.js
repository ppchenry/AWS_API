require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validateRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { createErrorResponse } = require("./utils/response");
const { logError } = require("./utils/logger");

const PUBLIC_RESOURCES = [];

/**
 * Orchestrates the SFExpressRoutes Lambda request lifecycle.
 *
 * Order of execution:
 * 1. OPTIONS preflight handling
 * 2. JWT authentication
 * 3. Cheap request guard validation
 * 4. DB bootstrap
 * 5. Exact route dispatch
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
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    const requestValidation = await validateRequest({ event });
    if (!requestValidation.isValid) return requestValidation.error;

    await getReadConnection();

    return await routeRequest({
      event,
      body: requestValidation.body,
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
