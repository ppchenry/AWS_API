/**
 * @fileoverview Declarative router for UserRoutes Lambda.
 * Flat route map following the same pattern as PetBasicInfo/src/router.js.
 * Each key is `METHOD /path-suffix` — adding a new route is one line.
 */

const { emailLogin, login2 } = require("./services/login");
const { isPhoneRegister, isEmailRegister, isRegisterNgo, isRegister, isEmailRegisterV2 } = require("./services/register");
const { generateSmsCode, verifySmsCode } = require("./services/sms");
const { isGetUserListNgo, isEditNgo, isGetPetPlacementOptions, isGetNgoDetails } = require("./services/ngo");
const { isGetUserDetails, isUpdateUserDetails, isDeleteUser } = require("./services/user");
const { updatePassword, updateUserImage } = require("./services/update");
const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object.<string, (routeContext: any) => Promise<any>>} RouteMap
 * Maps normalised `METHOD /path-suffix` keys to handler functions.
 */

/** @type {RouteMap} */
const routes = {
  'POST /login-2':                    login2,
  'POST /login':                      emailLogin,
  'PUT  /update-password':            updatePassword,
  'POST /register-by-phoneNumber':    isPhoneRegister,
  'POST /register-by-email':          isEmailRegister,
  'POST /register-ngo':               isRegisterNgo,
  'POST /register-email-2':           isEmailRegisterV2,
  'POST /register-email-app':         isEmailRegisterV2,
  'POST /register':                   isRegister,
  'POST /generate-sms-code':          generateSmsCode,
  'POST /verify-sms-code':            verifySmsCode,
  'POST /update-image':               updateUserImage,
  'GET  /user-list':                  isGetUserListNgo,
  'PUT  /edit-ngo':                   isEditNgo,
  'GET  /edit-ngo':                   isGetNgoDetails,
  'GET  /pet-placement-options':      isGetPetPlacementOptions,
  'GET  /user':                       isGetUserDetails,
  'PUT  /user':                       isUpdateUserDetails,
  'DELETE /user':                     isDeleteUser,
};

/**
 * Resolves the current request to a route handler based on the normalised
 * route key (`METHOD /suffix`). Returns a 404 when no route matches, or
 * a 405 when the path exists but the method is not allowed.
 *
 * @param {{
 *   event: import("aws-lambda").APIGatewayProxyEvent,
 *   httpMethod: string,
 *   resource: string,
 *   translations: Record<string, any>,
 * }} routeContext
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function routeRequest(routeContext) {
  const { event, httpMethod, resource, translations } = routeContext;
  const routeKey = `${httpMethod} ${resource}`;
  const handler = routes[routeKey];

  if (!handler) {
    return createErrorResponse(405, "others.methodNotAllowed", translations, event);
  }
  return handler(event, routeContext);
}

module.exports = { routeRequest };
