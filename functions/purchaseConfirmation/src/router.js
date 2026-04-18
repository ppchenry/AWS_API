const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "POST /purchase/confirmation": lazyRoute("./services/purchase", "submitPurchaseConfirmation"),
  "GET /purchase/shop-info": lazyRoute("./services/shop", "getShopInfo"),
  "GET /purchase/orders": lazyRoute("./services/order", "getOrders"),
  "GET /purchase/order-verification": lazyRoute("./services/orderVerification", "getOrderVerifications"),
  "DELETE /purchase/order-verification/{orderVerificationId}": lazyRoute("./services/orderVerification", "deleteOrderVerification"),
  "POST /purchase/send-ptag-detection-email": lazyRoute("./services/email", "sendPtagDetectionEmail"),

  // ==========================================
  // DEAD / GHOST ROUTES (Safe to ignore or remove)
  // These routes were either moved to other Lambdas or deleted from API Gateway,
  // but logic or permissions for them still existed in the monolithic index.js.
  // ==========================================
  "POST /purchase/get-presigned-url": null,
  "POST /v2/purchase/get-presigned-url": null,
  "POST /purchase/whatsapp-SF-message": null,
  "POST /v2/purchase/whatsapp-SF-message": null,
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
