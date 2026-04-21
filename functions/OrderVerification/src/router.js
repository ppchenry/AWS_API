const { createErrorResponse } = require("./utils/response");

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
