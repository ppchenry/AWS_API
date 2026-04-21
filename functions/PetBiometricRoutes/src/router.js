const { createErrorResponse } = require("./utils/response");

/**
 * Builds a lazy route resolver so service modules are only loaded when needed.
 *
 * @param {string} modulePath
 * @param {string} exportName
 * @returns {(ctx: { event: import("aws-lambda").APIGatewayProxyEvent, body?: any }) => Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "GET /petBiometrics/{petId}": lazyRoute("./services/petBiometric", "getPetBiometric"),
  "POST /petBiometrics/register": lazyRoute("./services/petBiometric", "registerPetBiometric"),
  "POST /petBiometrics/verifyPet": lazyRoute("./services/petBiometric", "verifyPetBiometric"),
};

/**
 * Resolves an API Gateway request to an exact route handler.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent, body?: any }} routeContext
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };