const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object} RouteContext
 * @property {import('aws-lambda').APIGatewayProxyEvent} event
 * @property {string} [petID] - Pet id from the route path
 * @property {Object} [pet] - The pet document (if validated)
 * @property {Object} [body] - Parsed request body
 */

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

/**
 * Mapping of AWS Resource paths to Service Functions
 * @type {Record<string, (ctx: RouteContext) => Promise<import('aws-lambda').APIGatewayProxyResult>>}
 */
const routes = {
  "GET /pets/{petID}/basic-info": lazyRoute("./services/basicInfo", "getPetBasicInfo"),
  "PUT /pets/{petID}/basic-info": lazyRoute("./services/basicInfo", "updatePetBasicInfo"),
  "GET /pets/{petID}/eyeLog": lazyRoute("./services/eyeLog", "getPetEyeAnalysisLogs"),
  "DELETE /pets/{petID}": lazyRoute("./services/basicInfo", "deletePetBasicInfo"),
};

/**
 * Matches the incoming AWS event to a specific service function.
 * * @async
 * @param {RouteContext} routeContext 
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>}
 */
async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(405, "petBasicInfo.errors.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };