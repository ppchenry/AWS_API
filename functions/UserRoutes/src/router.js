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
  // Body: userId, optional firstName, lastName, birthday, email, district, image, phoneNumber
  "PUT /account": lazyRoute("./services/user", "updateUserDetails"),

  // Path: userId
  "GET /account/{userId}": lazyRoute("./services/user", "getUserDetails"), 

  // Path: userId
  "DELETE /account/{userId}": lazyRoute("./services/user", "deleteUser"),

  // Body: email, password
  "POST /account/login": lazyRoute("./services/login", "emailLogin"),

  // Body: email or phone
  "POST /account/login-2": lazyRoute("./services/login", "checkUserExists"),

  // Body: phoneNumber
  "POST /account/generate-sms-code": lazyRoute("./services/sms", "generateSmsCode"),

  // Body: phoneNumber, code
  "POST /account/verify-sms-code": lazyRoute("./services/sms", "verifySmsCode"),

  // Body: firstName, password, optional lastName, phoneNumber, email, role, subscribe, promotion, district, image, birthday, gender
  "POST /account/register": lazyRoute("./services/register", "register"),

  // Not implemented
  "POST /account/register-by-email": null,

  // Not implemented
  "POST /account/register-by-phoneNumber": null,

  // Not implemented
  "POST /account/register-email-2": null,

  // Body: userId, oldPassword, newPassword
  "PUT /account/update-password": lazyRoute("./services/update", "updatePassword"),

  // Body: userId, image
  "POST /account/update-image": lazyRoute("./services/update", "updateUserImage"),

  // Body: email
  "POST /account/delete-user-with-email": lazyRoute("./services/user", "deleteUserByEmail"),

  // --- Missing from Console (Standardized with /account prefix) ---
  // These likely won't trigger unless added to AWS, but kept for logic safety
  // Body: firstName, lastName, phoneNumber, email, password, ngoName, address, businessRegistrationNumber, ngoPrefix, optional description, website, subscribe
  "POST /account/register-ngo": lazyRoute("./services/register", "registerNgo"),

  // Query: optional search, page
  "GET /account/user-list": lazyRoute("./services/ngo", "getNgoUserList"),

  // Path: ngoId | Body: userProfile.userId, optional userProfile, ngoProfile, ngoCounters, ngoUserAccessProfile fields
  "PUT /account/edit-ngo/{ngoId}": lazyRoute("./services/ngo", "editNgo"),

  // Path: ngoId
  "GET /account/edit-ngo/{ngoId}": lazyRoute("./services/ngo", "getNgoDetails"),

  // Path: ngoId
  "GET /account/edit-ngo/{ngoId}/pet-placement-options": lazyRoute("./services/ngo", "getNgoPetPlacementOptions"),
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
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };
