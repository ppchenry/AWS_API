const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "GET /animal/animalList/{lang}": lazyRoute("./services/referenceData", "getAnimalList"),
  "GET /product/productList": lazyRoute("./services/referenceData", "getProductList"),
  "POST /product/productLog": lazyRoute("./services/referenceData", "createProductLog"),
  "GET /deworm": lazyRoute("./services/referenceData", "getDewormList"),
  "GET /analysis/{eyeDiseaseName}": lazyRoute("./services/referenceData", "getEyeDisease"),
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
