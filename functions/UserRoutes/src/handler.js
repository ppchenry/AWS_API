// Trigger ENV validation immediately
require("./config/env");

const { getReadConnection } = require("./config/db");
const { loadTranslations } = require("./utils/i18n");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { validateUserRequest } = require("./middleware/userGuard");

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
  let translations = null;

  try {
    // 1. CORS Preflight
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // 2. Global Context Loading (i18n)
    // We do this BEFORE Auth so Auth errors can be translated
    translations = loadTranslations(
      event.cookies?.language || event.queryStringParameters?.lang || 'zh'
    );

    // 3. Authentication & Public Route Check
    const authError = authJWT({ event, translations });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) return authError;

    // 4. Infrastructure Setup (DB)
    await getReadConnection();

    // 5. Data Guard / Validation
    const userValidation = await validateUserRequest({ event, translations });
    if (!userValidation.isValid) return userValidation.error;

    // 6. Routing
    return await routeRequest({
      event,
      translations,
      user: userValidation.data,
      body: userValidation.body,
    });

  } catch (error) {
    console.error("Error in handleRequest:", error);
    return createErrorResponse(
      500, 
      "others.internalError", 
      translations, 
      event
    );
  }
}

module.exports = { handleRequest };