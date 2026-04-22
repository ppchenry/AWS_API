require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validatePetBiometricRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { logError } = require("./utils/logger");
const { createErrorResponse } = require("./utils/response");

const PUBLIC_RESOURCES = [];

/**
 * Orchestrates the PetBiometricRoutes Lambda lifecycle.
 *
 * Order: OPTIONS handling, JWT auth, cheap guard validation, DB bootstrap,
 * exact route dispatch, and catch-all error handling.
 *
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

    const requestValidation = await validatePetBiometricRequest({ event });
    if (!requestValidation.isValid) {
      return requestValidation.error;
    }

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