// Trigger ENV validation immediately at cold start
require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { validateEyeUploadRequest } = require("./middleware/guard");
const { logError } = require("./utils/logger");

/**
 * All routes in this Lambda require JWT authentication.
 * Empty array = no public (unauthenticated) routes.
 */
const PUBLIC_RESOURCES = [];

/**
 * Orchestrates the lifecycle of the EyeUpload Lambda.
 */
async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    // 1. CORS Preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // 2. JWT Authentication
    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) {
      return authError;
    }

    // 3. Guard Layer (cheap, no DB)
    const validation = validateEyeUploadRequest({ event });
    if (!validation.isValid) return validation.error;

    // 4. DB Connection
    await getReadConnection();

    // 5. Route Dispatch
    return await routeRequest({ event, body: validation.body });
  } catch (error) {
    logError("Unhandled request error", {
      scope: "handler.handleRequest",
      event,
      error,
      extra: { awsRequestId: context.awsRequestId },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { handleRequest };
