/**
 * @fileoverview Orchestration layer for the UserRoutes Lambda.
 * Handles: OPTIONS → auth → DB → translations → normalise → router → global catch.
 */

const { getReadConnection } = require("./config/db");
const { loadTranslations } = require("./utils/i18n");
const { createErrorResponse } = require("./utils/response");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { routeRequest } = require("./router");
const { normalizeResource } = require("./utils/normalizeResource");

/** Path suffixes that do not require JWT authentication. */
const PUBLIC_PATHS = [
  "/login",
  "/login-2",
  "/register",
  "/register-by-phoneNumber",
  "/register-by-email",
  "/register-email-2",
  "/register-email-app",
  "/register-ngo",
  "/generate-sms-code",
  "/verify-sms-code",
];

/**
 * Resolves the language for the current request from cookies or body.
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {string}
 */
function requestLang(event) {
  let bodyLang;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    bodyLang = body.lang?.toLowerCase();
  } catch {
    bodyLang = undefined;
  }
  return event.cookies?.language || bodyLang || "zh";
}

/**
 * Main request handler — delegates lifecycle to focused modules.
 *
 * @async
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @param {import("aws-lambda").Context} context
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  let translations = null;

  try {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) return optionsResponse;

    const lang = requestLang(event);
    translations = loadTranslations(lang);

    const userId = event.pathParameters?.userId;

    const resource = normalizeResource(event.path, event.resource, userId || "/account");

    const authError = authJWT(event, translations);
    if (authError && !PUBLIC_PATHS.includes(resource)) {
      return authError;
    }

    await getReadConnection();

    return await routeRequest({
      event,
      httpMethod: (event.httpMethod || "GET").toUpperCase(),
      resource,
      lang,
      translations,
    });
  } catch (error) {
    console.error("Error in handleRequest:", error);
    return createErrorResponse(500, "others.internalError", translations, event);
  }
}

module.exports = { handleRequest };
