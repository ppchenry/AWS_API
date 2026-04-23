const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object} RouteContext
 * @property {import('aws-lambda').APIGatewayProxyEvent} event
 */

/**
 * Creates a route handler that loads a service module on demand.
 * This trims cold-start work without changing endpoint behavior.
 *
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
 * @type {Record<string, ((ctx: RouteContext) => Promise<any>) | null>}
 */
const routes = {
  "PUT /account": lazyRoute("./services/user", "updateUserDetails"),
  "GET /account/{userId}": lazyRoute("./services/user", "getUserDetails"), 
  "DELETE /account/{userId}": lazyRoute("./services/user", "deleteUser"),
  "POST /account/login": null,
  // "POST /account/login": lazyRoute("./services/login", "emailLogin"),
  "POST /account/login-2": null,
  "POST /account/generate-sms-code": lazyRoute("./services/sms", "generateSmsCode"),
  "POST /account/verify-sms-code": lazyRoute("./services/sms", "verifySmsCode"),
  "POST /account/register": lazyRoute("./services/register", "register"),
  "POST /account/register-by-email": null,
  "POST /account/register-by-phoneNumber": null,
  "POST /account/register-email-2": null,
  // "PUT /account/update-password": lazyRoute("./services/update", "updatePassword"),
  "PUT /account/update-password": null,
  "POST /account/update-image": lazyRoute("./services/update", "updateUserImage"),
  "POST /account/delete-user-with-email": lazyRoute("./services/user", "deleteUserByEmail"),
  "POST /v2/account/register-ngo": lazyRoute("./services/register", "registerNgo"),
  "GET /v2/account/user-list": lazyRoute("./services/ngo", "getNgoUserList"),
  "PUT /v2/account/edit-ngo/{ngoId}": lazyRoute("./services/ngo", "editNgo"),
  "GET /v2/account/edit-ngo/{ngoId}": lazyRoute("./services/ngo", "getNgoDetails"),
  "GET /v2/account/edit-ngo/{ngoId}/pet-placement-options": lazyRoute("./services/ngo", "getNgoPetPlacementOptions"),
};

/**
 * Matches the incoming AWS event to a specific service function.
 * @async
 * @param {RouteContext} routeContext
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>}
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
