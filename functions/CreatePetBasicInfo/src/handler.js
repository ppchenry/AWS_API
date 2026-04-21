require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validateRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { createErrorResponse } = require("./utils/response");
const { logError } = require("./utils/logger");

const PUBLIC_RESOURCES = [];

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
      return optionsResponse;
    }

    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) {
      return authError;
    }

    const guardResult = await validateRequest({ event });
    if (!guardResult.isValid) {
      return guardResult.error;
    }

    await getReadConnection();

    return await routeRequest({
      event,
      body: guardResult.body,
    });
  } catch (error) {
    logError("Unhandled CreatePetBasicInfo request error", {
      scope: "handler.handleRequest",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };