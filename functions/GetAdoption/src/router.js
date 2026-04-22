const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "GET /adoption": lazyRoute("./services/adoption", "getAdoptionList"),
  "GET /adoption/{id}": lazyRoute("./services/adoption", "getAdoptionById"),
};

async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(405, "common.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };