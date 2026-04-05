// Trigger ENV validation immediately
require("./config/env");

const { getReadConnection } = require('./config/db');
const { loadTranslations } = require('./utils/i18n');
const { validatePetRequest } = require('./middleware/petGuard');
const { createErrorResponse } = require('./utils/response');
const { routeRequest } = require('./router');
const { handleOptions } = require('./cors');
const { authJWT } = require('./middleware/authJWT');

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
    if (authError) return authError;

    // 4. Infrastructure Setup (DB)
    await getReadConnection();

    // 5. Data Guard / Validation
    const petValidation = await validatePetRequest({ event, translations });
    if (!petValidation.isValid) return petValidation.error;

    // 6. Routing
    return await routeRequest({
      event,
      translations,
      pet: petValidation.data,
      body: petValidation.body,
    });
  } catch (error) {
    console.error('Error in handleRequest:', error);
    return createErrorResponse(
      500,
      'petBasicInfo.errors.internalServerError',
      translations,
      event
    );
  }
}

module.exports = { handleRequest };