const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object} RouteContext
 * @property {import("aws-lambda").APIGatewayProxyEvent} event
 * @property {Record<string, any> | null} body
 */

/**
 * Lazily loads a service module only when its route is requested.
 *
 * @param {string} modulePath
 * @param {string} exportName
 * @returns {(ctx: RouteContext) => Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "POST /sf-express-routes/create-order": lazyRoute("./services/sfOrder", "createOrder"),
  "POST /sf-express-routes/get-pickup-locations": lazyRoute("./services/sfMetadata", "getPickupLocations"),
  "POST /sf-express-routes/get-token": lazyRoute("./services/sfMetadata", "getToken"),
  "POST /sf-express-routes/get-area": lazyRoute("./services/sfMetadata", "getArea"),
  "POST /sf-express-routes/get-netCode": lazyRoute("./services/sfMetadata", "getNetCode"),
  "POST /v2/sf-express-routes/print-cloud-waybill": lazyRoute("./services/sfWaybill", "printCloudWaybill"),
};

/**
 * Dispatches the request using an exact `${method} ${resource}` route key.
 *
 * @async
 * @param {RouteContext} routeContext
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
