// Trigger ENV validation immediately
require("./config/env");

const { getReadConnection } = require("./config/db");
const { validatePetRequest } = require("./middleware/petGuard");
const { createErrorResponse } = require("./utils/response");
const { routeRequest } = require("./router");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { logError } = require("./utils/logger");

/**
 * Orchestrates the lifecycle of a single Lambda invocation.
 * Handles DB connection, request parsing, routing, and global error catching.
 * * @async
 * @param {import('aws-lambda').APIGatewayProxyEvent} event - The raw event object from API Gateway.
 * @param {import('aws-lambda').Context} context - The Lambda execution context.
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>} The standardized HTTP response.
 */
async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    // 1. CORS Preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // 3. Authentication & Public Route Check
    const authError = authJWT({ event });
    if (authError) return authError;

    // 4. Infrastructure Setup (DB)
    await getReadConnection();

    // 5. Data Guard / Validation
    const petValidation = await validatePetRequest({ event });
    if (!petValidation.isValid) return petValidation.error;

    // 6. Routing
    return await routeRequest({
      event,
      pet: petValidation.data,
      body: petValidation.body,
    });
  } catch (error) {
    logError("Unhandled PetBasicInfo request error", {
      scope: "handler.handleRequest",
      event,
      error,
    });
    return createErrorResponse(
      500,
      "petBasicInfo.errors.internalServerError",
      event
    );
  }
}

module.exports = { handleRequest };