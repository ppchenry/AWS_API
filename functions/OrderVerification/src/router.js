const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object} RouteContext
 * @property {import("aws-lambda").APIGatewayProxyEvent} event
 * @property {Record<string, any>|null} [body]
 */

/**
 * Defers loading the service module until the route is actually invoked.
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
  "GET /v2/orderVerification/supplier/{orderId}": lazyRoute("./services/orderVerification", "getSupplierOrderVerification"),
  "PUT /v2/orderVerification/supplier/{orderId}": lazyRoute("./services/orderVerification", "updateSupplierOrderVerification"),
  "GET /v2/orderVerification/ordersInfo/{tempId}": lazyRoute("./services/orderVerification", "getOrderInfo"),
  "GET /v2/orderVerification/whatsapp-order-link/{_id}": lazyRoute("./services/orderVerification", "getWhatsAppOrderLink"),
  "GET /v2/orderVerification/getAllOrders": lazyRoute("./services/orderVerification", "getAllOrders"),
  "GET /v2/orderVerification/{tagId}": lazyRoute("./services/orderVerification", "getTagOrderVerification"),
  "PUT /v2/orderVerification/{tagId}": lazyRoute("./services/orderVerification", "updateTagOrderVerification"),
  "DELETE /v2/orderVerification/{tagId}": null,
};

/**
 * Resolves an incoming route to the mapped service handler.
 *
 * @param {RouteContext} routeContext
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
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
