/**
 * @fileoverview Route dispatch for the EmailVerification Lambda.
 * Uses exact key matching and lazyRoute() pattern.
 */

const { createErrorResponse } = require("./utils/response");

/**
 * Creates a route handler that loads a service module on demand.
 * @param {string} modulePath
 * @param {string} exportName
 * @returns {function(RouteContext): Promise<any>}
 */
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

/**
 * Route map. Keys use event.resource (API Gateway template path), not event.path.
 * null entries are frozen/deprecated routes returning 405.
 *
 * @type {Record<string, ((ctx: {event: any, body: any}) => Promise<any>) | null>}
 */
const routes = {
  "POST /account/generate-email-code": lazyRoute(
    "./services/generateCode",
    "generateEmailCode"
  ),
  "POST /account/verify-email-code": lazyRoute(
    "./services/verifyCode",
    "verifyEmailCode"
  ),
  // Frozen: merged into /account/generate-email-code
  "POST /account/generate-email-code-2": null,
};

/**
 * Matches the incoming AWS event to a specific service function.
 * @async
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent, body: Record<string, any> }} routeContext
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (routeAction === null) {
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  if (!routeAction) {
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };
