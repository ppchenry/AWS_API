require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { validateOrderVerificationRequest } = require("./middleware/guard");
const { logError } = require("./utils/logger");

const PUBLIC_RESOURCES = [];

/**
 * Orchestrates the full OrderVerification request lifecycle.
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

    const requestValidation = await validateOrderVerificationRequest({ event });
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

    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };
