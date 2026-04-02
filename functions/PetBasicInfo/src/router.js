const { deletePetBasicInfo, getPetBasicInfo, updatePetBasicInfo } = require("./services/basicInfo");
const { getPetEyeAnalysisLogs } = require("./services/eyeLog");
const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object.<string, (routeContext: any) => Promise<any>>} RouteMap
 * Maps normalized method-and-path keys to route handler functions.
 * Each key should follow the format `<HTTP_METHOD> <PATH_SUFFIX>`.
 * Example: `GET /basic-info`.
 */

/**
 * @type {RouteMap}
 */
const routes = {
  'GET /basic-info': getPetBasicInfo,
  'PUT /basic-info': updatePetBasicInfo,
  'GET /eyeLog': getPetEyeAnalysisLogs,
  'DELETE /': deletePetBasicInfo,
};

/**
 * Resolves the current request to a route handler based on the normalized route key.
 * Returns a standardized 405 response when no route matches the incoming request.
 *
 * @param {{
 *   event: import("aws-lambda").APIGatewayProxyEvent | Record<string, any>,
 *   body: Record<string, any> | null, // parsed request body (object) or null if no body
 *   pet: any, // validated pet document
 *   petID: string,
 *   lang: string,
 *   translations: Record<string, any>,
 *   httpMethod: string,
 *   resource?: string,
 *   path?: string
 * }} routeContext - Prepared request data for route resolution and downstream handlers. No raw body, only parsed body, and no duplicated fields.
 * @returns {Promise<Function | {statusCode: number, headers: Record<string, string>, body: string}>} The matched route handler or a method-not-allowed response.
 */
async function routeRequest(routeContext) {
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

module.exports = { routeRequest };