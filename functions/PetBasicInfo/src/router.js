import { createErrorResponse } from "./utils/response";

/**
 * Maps normalized method-and-path keys to route handlers for this Lambda.
 *
 * Each key should follow the format `<HTTP_METHOD> <PATH_SUFFIX>`.
 * Example: `GET /basic-info`.
 */
const routes = {
  'GET /basic-info': () => {},
  'PUT /basic-info': () => {},
  'GET /eyeLog': () => {},
  'DELETE /': () => {},
};

/**
 * Resolves the current request to a route handler based on the normalized route key.
 * Returns a standardized 405 response when no route matches the incoming request.
 *
 * @param {{
 *   event: import("aws-lambda").APIGatewayProxyEvent | Record<string, any>,
 *   body?: Record<string, any>,
 *   pet?: any,
 *   petID?: string,
 *   lang?: string,
 *   translations: Record<string, any>,
 *   httpMethod: string,
 *   resource?: string,
 *   path?: string
 * }} routeContext Prepared request data for route resolution and downstream handlers.
 * @returns {Promise<Function | {statusCode: number, headers: Record<string, string>, body: string}>} The matched route handler or a method-not-allowed response.
 */
export async function routeRequest(routeContext) {
  const { event, httpMethod, resource, path, translations } = routeContext;
  const routePath = resource || path || '/';
  const routeKey = `${httpMethod} ${routePath}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(
      405,
      'petBasicInfo.errors.methodNotAllowed', 
      translations, 
      event
    );
  }
  return await routeAction(routeContext);
}