require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validateUserRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { logError } = require("./utils/logger");

const PUBLIC_RESOURCES = [];

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    const validation = await validateUserRequest({ event });
    if (!validation.isValid) return validation.error;

    await getReadConnection();

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