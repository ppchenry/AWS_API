require("./config/env");

const { getReadConnection, connectToMongoDB } = require("./config/db");
const { handleOptions } = require("./cors");
const { routeRequest } = require("./router");
const { validateGetBreedRequest } = require("./middleware/guard");
const { createErrorResponse } = require("./utils/response");
const { logError } = require("./utils/logger");

const WRITE_ROUTE_KEYS = new Set(["POST /product/productLog"]);

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    const validation = await validateGetBreedRequest({ event });
    if (!validation.isValid) return validation.error;

    if (WRITE_ROUTE_KEYS.has(`${event.httpMethod} ${event.resource}`)) {
      await connectToMongoDB();
    } else {
      await getReadConnection();
    }

    return await routeRequest({
      event,
      body: validation.body,
    });
  } catch (error) {
    logError("Unhandled GetBreed request error", {
      scope: "handler.handleRequest",
      event,
      error,
    });

    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { handleRequest };
