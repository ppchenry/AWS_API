// Trigger ENV validation immediately
require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { validatePetDetailRequest } = require("./middleware/guard");
const { authorizeOwnership } = require("./middleware/ownership");
const { logError } = require("./utils/logger");

// All routes in this Lambda are protected — no public resources
const PUBLIC_RESOURCES = [];

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    // 1. CORS Preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // 2. JWT Authentication
    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    // 3. Guard Layer (cheap, no DB)
    const validation = await validatePetDetailRequest({ event });
    if (!validation.isValid) return validation.error;

    // 4. DB Connection
    await getReadConnection();

    // 5. Ownership Authorization (requires DB)
    const ownershipError = await authorizeOwnership({ event });
    if (ownershipError) return ownershipError;

    // 6. Route Dispatch
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
