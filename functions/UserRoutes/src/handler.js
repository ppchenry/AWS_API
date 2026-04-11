// Trigger ENV validation immediately
require("./config/env");

const { getReadConnection } = require("./config/db");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { validateUserRequest } = require("./middleware/guard");
const { logError } = require("./utils/logger");

/** * Paths that do not require a valid JWT. 
 * Matches the 'event.resource' template from AWS.
 */
const PUBLIC_RESOURCES = [
  "/account/login",
  "/account/login-2",
  "/account/register",
  "/account/register-by-phoneNumber",
  "/account/register-by-email",
  "/account/register-email-2",
  "/account/register-email-app",
  "/account/register-ngo",
  "/account/generate-sms-code",
  "/account/verify-sms-code",
];

/**
 * Orchestrates the lifecycle of the UserRoutes Lambda.
 * @async
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 * @param {import('aws-lambda').Context} context
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>}
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
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    // 4. Infrastructure Setup (DB)
    await getReadConnection();

    // 5. Data Guard / Validation
    const userValidation = await validateUserRequest({ event });
    if (!userValidation.isValid) return userValidation.error;

    // 6. Routing
    return await routeRequest({
      event,
      body: userValidation.body,
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
    return createErrorResponse(
      500, 
      "others.internalError", 
      event
    );
  }
}

module.exports = { handleRequest };