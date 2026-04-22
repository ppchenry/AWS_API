// Trigger ENV validation immediately at cold start
require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validateAuthRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { createErrorResponse } = require("./utils/response");
const { logError } = require("./utils/logger");

/**
 * Paths that do not require a valid JWT.
 * /auth/refresh authenticates via refresh-token cookie, not a Bearer JWT.
 */
const PUBLIC_RESOURCES = ["/auth/refresh"];

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    // 1. CORS Preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // 2. Authentication (skipped for public resources)
    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    // 3. Guard (cheap, no DB)
    const guardResult = validateAuthRequest({ event });
    if (!guardResult.isValid) return guardResult.error;

    // 4. DB Connection
    await getReadConnection();

    // 5. Route Dispatch
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

    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { handleRequest };
