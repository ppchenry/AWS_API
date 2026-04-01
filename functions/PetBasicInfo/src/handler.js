import { getReadConnection } from './config/db';
import { loadTranslations } from './utils/i18n';
import { validatePetRequest } from './middleware/petGuard';
import { createErrorResponse } from './utils/response';
import { routeRequest } from './router';

/**
 * Orchestrates the lifecycle of a single Lambda invocation.
 * Handles DB connection, request parsing, routing, and global error catching.
 * * @async
 * @param {import('aws-lambda').APIGatewayProxyEvent} event - The raw event object from API Gateway.
 * @param {import('aws-lambda').Context} context - The Lambda execution context (contains methods like callbackWaitsForEmptyEventLoop).
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>} The standardized HTTP response for API Gateway.
 */
export async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  let translations = null;

  try {
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
      ...request,
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