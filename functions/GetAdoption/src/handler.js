require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validateAdoptionRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { createErrorResponse } = require("./utils/response");
const { logError } = require("./utils/logger");

const PUBLIC_RESOURCES = ["/adoption", "/adoption/{id}"];

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

    const guardResult = await validateAdoptionRequest({ event });
    if (!guardResult.isValid) {
      return guardResult.error;
    }

    await getReadConnection();

    return await routeRequest({
      event,
      query: guardResult.query,
    });
  } catch (error) {
    logError("Unhandled GetAdoption request error", {
      scope: "handler.handleRequest",
      event,
      error,
    });

    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };