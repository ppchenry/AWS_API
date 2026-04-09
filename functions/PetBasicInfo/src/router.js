const { deletePetBasicInfo, getPetBasicInfo, updatePetBasicInfo } = require("./services/basicInfo");
const { getPetEyeAnalysisLogs } = require("./services/eyeLog");
const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object} RouteContext
 * @property {import('aws-lambda').APIGatewayProxyEvent} event
 * @property {Object} translations - Language map
 * @property {Object} [pet] - The pet document (if validated)
 * @property {Object} [body] - Parsed request body
 */

/**
 * Mapping of AWS Resource paths to Service Functions
 * @type {Record<string, (ctx: RouteContext) => Promise<import('aws-lambda').APIGatewayProxyResult>>}
 */
const routes = {
  "GET /pets/{petID}/basic-info": getPetBasicInfo,
  "PUT /pets/{petID}/basic-info": updatePetBasicInfo,
  "GET /pets/{petID}/eyeLog":     getPetEyeAnalysisLogs,
  "DELETE /pets/{petID}":         deletePetBasicInfo,
};

/**
 * Matches the incoming AWS event to a specific service function.
 * * @async
 * @param {RouteContext} routeContext 
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>}
 */
async function routeRequest(routeContext) {
  const { event, translations } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
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