const { emailLogin, checkUserExists } = require("./services/login");
const { registerNgo, register } = require("./services/register");
const { generateSmsCode, verifySmsCode } = require("./services/sms");
const { getNgoUserList, editNgo, getNgoPetPlacementOptions, getNgoDetails } = require("./services/ngo");
const { isGetUserDetails, isUpdateUserDetails, isDeleteUser } = require("./services/user");
const { updatePassword, updateUserImage } = require("./services/update");
const { createErrorResponse } = require("./utils/response");

/**
 * @typedef {Object} RouteContext
 * @property {import('aws-lambda').APIGatewayProxyEvent} event
 * @property {Object} translations
 */

/**
 * @type {Record<string, (ctx: RouteContext) => Promise<any>>}
 */
const routes = {
  "GET /account": isGetUserDetails,
  'PUT /account': isUpdateUserDetails,
  'GET /account/{userId}': isGetUserDetails,
  'DELETE /account/{userId}': isDeleteUser,

  'POST /account/login': emailLogin,
  'POST /account/login-2': checkUserExists,
  'POST /account/generate-sms-code': generateSmsCode,
  'POST /account/verify-sms-code': verifySmsCode,
  'POST /account/generate-email-code': null,
  'POST /account/generate-email-code-2': null,
  'POST /account/verify-email-code': null,

  'POST /account/register': register,
  'POST /account/register-by-email': null,
  'POST /account/register-by-phoneNumber': null,
  'POST /account/register-email-2': null,

  'PUT /account/update-password': updatePassword,
  'POST /account/update-image': updateUserImage,
  'POST /account/delete-user-with-email': isDeleteUser,

  // --- Missing from Console (Standardized with /account prefix) ---
  // These likely won't trigger unless added to AWS, but kept for logic safety
  'POST /account/register-ngo': registerNgo,
  'POST /account/register-email-app': registerByEmailV2,
  'GET /account/user-list': getNgoUserList,
  'PUT /account/edit-ngo': editNgo,
  'GET /account/edit-ngo': getNgoDetails,
  'GET /account/pet-placement-options': getNgoPetPlacementOptions,
};

/**
 * Matches the incoming AWS event to a specific service function.
 * * @async
 * @param {RouteContext} routeContext 
 * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>}
 */
async function routeRequest(routeContext) {
  const { event, translations } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(
      405,
      'others.methodNotAllowed', 
      translations, 
      event
    );
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };
