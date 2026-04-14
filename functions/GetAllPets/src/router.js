const { createErrorResponse } = require("./utils/response");

/**
 * Creates a lazy-loaded route handler that requires the service module on first invocation.
 * @param {string} modulePath - Relative path to the service module
 * @param {string} exportName - Named export to call on the module
 * @returns {function} Async route handler
 */
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "GET /pets/pet-list-ngo/{ngoId}": lazyRoute("./services/ngoPetList", "getNgoPetList"),
  "POST /pets/deletePet": lazyRoute("./services/deletePet", "deletePet"),
  "PUT /pets/updatePetEye": lazyRoute("./services/updatePetEye", "updatePetEye"),
  "GET /pets/pet-list/{userId}": lazyRoute("./services/userPetList", "getUserPetList"),
};

/**
 * Routes an incoming request to the matching service handler based on HTTP method and resource path.
 * @param {object} routeContext - Context object containing event, body, etc.
 * @returns {Promise<object>} API Gateway response from the matched service, or 405 if no match
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
