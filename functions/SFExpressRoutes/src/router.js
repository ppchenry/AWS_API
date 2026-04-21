const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "POST /sf-express-routes/create-order": lazyRoute("./services/sfExpress", "createOrder"),
  "POST /sf-express-routes/get-pickup-locations": lazyRoute("./services/sfExpress", "getPickupLocations"),
  "POST /sf-express-routes/get-token": lazyRoute("./services/sfExpress", "getToken"),
  "POST /sf-express-routes/get-area": lazyRoute("./services/sfExpress", "getArea"),
  "POST /sf-express-routes/get-netCode": lazyRoute("./services/sfExpress", "getNetCode"),
  "POST /v2/sf-express-routes/print-cloud-waybill": lazyRoute("./services/sfExpress", "printCloudWaybill"),
};

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
