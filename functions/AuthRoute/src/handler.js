require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { routeRequest } = require("./router");
const { createErrorResponse } = require("./utils/response");
const { logError } = require("./utils/logger");

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    await getReadConnection();

    return await routeRequest({ event });
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
