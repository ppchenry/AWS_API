const { emailLogin, login2 } = require("./services/login");
const { isPhoneRegister, isEmailRegister, isRegisterNgo, isRegister, isEmailRegisterV2 } = require("./services/register");
const { generateSmsCode, verifySmsCode } = require("./services/sms");
const { isGetUserListNgo, isEditNgo, isGetPetPlacementOptions, isGetNgoDetails } = require("./services/ngo");
const { isGetUserDetails, isUpdateUserDetails, isDeleteUser } = require("./services/user");
const { updatePassword, updateUserImage } = require("./services/update");
const { createErrorResponse } = require("./utils/response");
const { loadTranslations } = require("./helpers/i18n");

/**
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
 * login-2 is handled elsewhere in the monolithic handler; exclude it from plain /login.
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 */
function isLogin2Route(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/login-2") || resource.includes("/login-2");
}

function isEmailLoginRoute(event) {
  if (isLogin2Route(event)) return false;
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/login") || resource.includes("/login");
}

function isUpdatePasswordRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/update-password") || resource.includes("/update-password");
}

function isPhoneRegisterRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return (
    path.includes("/register-by-phoneNumber") ||
    resource.includes("/register-by-phoneNumber")
  );
}

function isEmailRegisterRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/register-by-email") || resource.includes("/register-by-email");
}

function isRegisterNgoRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/register-ngo") || resource.includes("/register-ngo");
}

function isEmailRegisterV2Route(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return (
    path.includes("/register-email-2") ||
    resource.includes("/register-email-2") ||
    path.includes("/register-email-app") ||
    resource.includes("/register-email-app")
  );
}

/** Plain /register only (not phone/email/ngo/app variants — order in routeMatchers must stay after specific routes). */
function isRegisterRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  const s = `${path} ${resource}`;
  if (!s.includes("/register")) return false;
  if (s.includes("/register-by-phoneNumber")) return false;
  if (s.includes("/register-by-email")) return false;
  if (s.includes("/register-email-2") || s.includes("/register-email-app")) return false;
  if (s.includes("/register-ngo")) return false;
  return true;
}

function isGenerateSmsCodeRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/generate-sms-code") || resource.includes("/generate-sms-code");
}

function isVerifySmsCodeRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/verify-sms-code") || resource.includes("/verify-sms-code");
}

function isUpdateUserImageRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/update-image") || resource.includes("/update-image");
}

function isGetUserListNgoRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/user-list") || resource.includes("/user-list");
}

function isEditNgoRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/edit-ngo") || resource.includes("/edit-ngo");
}

function isGetPetPlacementOptionsRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/pet-placement-options") || resource.includes("/pet-placement-options");
}

function isUserRoute(event) {
  const path = event.path || "";
  const resource = event.resource || "";
  return path.includes("/user") || resource.includes("/user");
}

/**
 * Maps logical route names → predicate(event). First matching key wins (insertion order).
 * @type {Record<string, (event: import("aws-lambda").APIGatewayProxyEvent) => boolean>}
 */
const routeMatchers = {
  login: isEmailLoginRoute,
  login2: isLogin2Route,
  updatePassword: isUpdatePasswordRoute,
  phoneRegister: isPhoneRegisterRoute,
  emailRegister: isEmailRegisterRoute,
  registerNgo: isRegisterNgoRoute,
  emailRegisterV2: isEmailRegisterV2Route,
  generateSmsCode: isGenerateSmsCodeRoute,
  verifySmsCode: isVerifySmsCodeRoute,
  updateUserImage: isUpdateUserImageRoute,
  getUserListNgo: isGetUserListNgoRoute,
  editNgo: isEditNgoRoute,
  getPetPlacementOptions: isGetPetPlacementOptionsRoute,
  user: isUserRoute,
  register: isRegisterRoute,
};

/**
 * Maps route name → HTTP method → handler.
 * @type {Record<string, Partial<Record<string, (event: any, context: any) => Promise<any>>>>}
 */
const routeHandlers = {
  login: {
    POST: emailLogin,
  },
  login2: {
    POST: login2,
  },
  updatePassword: {
    PUT: updatePassword,
  },
  phoneRegister: {
    POST: isPhoneRegister,
  },
  emailRegister: {
    POST: isEmailRegister,
  },
  registerNgo: {
    POST: isRegisterNgo,
  },
  register: {
    POST: isRegister,
  },
  emailRegisterV2: {
    POST: isEmailRegisterV2,
  },
  generateSmsCode: {
    POST: generateSmsCode,
  },
  verifySmsCode: {
    POST: verifySmsCode,
  },
  updateUserImage: {
    POST: updateUserImage,
  },
  getUserListNgo: {
    GET: isGetUserListNgo,
  },
  editNgo: {
    PUT: isEditNgo,
    GET: isGetNgoDetails,
  },
  getPetPlacementOptions: {
    GET: isGetPetPlacementOptions,
  },
  user: {
    GET: isGetUserDetails,
    PUT: isUpdateUserDetails,
    DELETE: isDeleteUser,
  },
};

/**
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {string | null}
 */
function resolveRouteKey(event) {
  const key = Object.keys(routeMatchers).find((name) => routeMatchers[name](event));
  return key ?? null;
}

/**
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @param {import("aws-lambda").Context} context
 */
async function router(event, context) {
  const lang = requestLang(event);
  const t = loadTranslations(lang);
  const method = (event.httpMethod || "GET").toUpperCase();

  const routeKey = resolveRouteKey(event);
  if (!routeKey) {
    return createErrorResponse(404, "others.routeNotFound", t, event);
  }

  const handler = routeHandlers[routeKey]?.[method];
  if (!handler) {
    return createErrorResponse(405, "others.methodNotAllowed", t, event);
  }

  try {
    return await handler(event, context);
  } catch (err) {
    console.error("router handler error:", err);
    return createErrorResponse(500, "others.internalError", t, event);
  }
}

module.exports = { router };
