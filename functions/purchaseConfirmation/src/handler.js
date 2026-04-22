// Trigger ENV validation at cold start
require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validatePurchaseRequest } = require("./middleware/guard");
const { routeRequest } = require("./router");
const { logError } = require("./utils/logger");

/**
 * Routes that do not require a valid JWT.
 * Must match event.resource exactly.
 */
const PUBLIC_RESOURCES = [
  "/purchase/confirmation",
  "/purchase/shop-info",
];

/**
 * Orchestrates the full request lifecycle for the purchaseConfirmation Lambda.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @param {import("aws-lambda").Context} context
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    // 1. CORS preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // 2. JWT authentication
    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    // 3. Guard — RBAC, JSON parse, empty body, ObjectId validation
    const guardResult = await validatePurchaseRequest({ event });
    if (!guardResult.isValid) return guardResult.error;

    // 4. DB connection
    await getReadConnection();

    // 5. Route dispatch
    return await routeRequest({ event, body: guardResult.body });
  } catch (error) {
    logError("Unhandled request error", {
      scope: "handler.handleRequest",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { handleRequest };
