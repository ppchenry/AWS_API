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
 * @param {import('aws-lambda').Context} context - The Lambda execution context (contains methods like callbackWaitsForEmptyEventLoop).
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>} The standardized HTTP response for API Gateway.
 */
async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  let translations = null;

  try {
    // Handle CORS preflight before anything else
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    // Authenticate before processing
    const authError = authJWT(event);
    if (authError) return authError;

    await getReadConnection();
    const lang = event.cookies?.language || event.queryStringParameters?.lang || 'zh';
    translations = loadTranslations(lang);

    const request = {
      event,
      body: event.body,
      petID: event.pathParameters?.petID,
      lang,
      translations,
    };

    const petValidation = await validatePetRequest(request);
    if (!petValidation.isValid) return petValidation.error;

    return await routeRequest({
      event,
      petID: request.petID,
      lang: request.lang,
      translations: request.translations,
      httpMethod: event.httpMethod,
      resource: event.resource,
      path: event.path,
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