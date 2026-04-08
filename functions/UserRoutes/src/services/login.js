const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { issueUserAccessToken, issueNgoAccessToken, createRefreshToken } = require("../utils/token");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getTranslation } = require("../utils/i18n");
const { emailLoginSchema, checkUserExistsSchema } = require("../zodSchema/loginSchema");

/**
 * @typedef {Object} RouteContext
 * @property {import('aws-lambda').APIGatewayProxyEvent} event
 * @property {Object} translations
 * @property {Object} body
 */

/**
 * Gets the cookie path based on API Gateway stage.
 */
function getCookiePath(event) {
  const stage = event.requestContext?.stage || "";
  if (stage === "Dev") return "/Dev/auth/refresh";
  if (stage === "Production") return "/Production/auth/refresh";
  return "/auth/refresh";
}

// TODO: rate limit
/**
 * Handles NGO user login logic.
 * @param {Object} user - The user object
 * @param {Object} event - The API Gateway event
 * @param {Object} translations - Translation object
 * @param {string} cookiePath - Cookie path for refresh token
 * @returns {Promise<Object>} Response object
 */
async function handleNGOLogin(user, event, translations, cookiePath) {
  const t = translations;
  try {
    const NgoUserAccess = mongoose.model("NgoUserAccess");
    const NGO = mongoose.model("NGO");

    const ngoUserAccess = await NgoUserAccess.findOne({
      userId: user._id,
      isActive: true,
    });

    if (!ngoUserAccess) {
      return createErrorResponse(401, "emailLogin.userNGONotFound", t, event);
    }

    const ngo = await NGO.findOne({ _id: ngoUserAccess.ngoId });
    if (!ngo) {
      return createErrorResponse(401, "emailLogin.NGONotFound", t, event);
    }

    const token = issueNgoAccessToken(user, ngo);

    const { token: newRefreshToken } = await createRefreshToken(user._id);

    return createSuccessResponse(
      200,
      event,
      {
        message: getTranslation(t, "emailLogin.success") + ` ${ngo.name}`,
        data: { token, user, ngo, ngoUserAccess },
      },
      {
        "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${process.env.REFRESH_TOKEN_MAX_AGE_SEC}`,
        "Access-Control-Allow-Credentials": "true",
      }
    );
  } catch (err) {
    return createErrorResponse(500, "Internal Server Error", t, event);
  }
}

/**
 * Handles email login for regular users and NGO users.
 * @param {RouteContext} routeContext
 */
async function emailLogin({ event, translations, body }) {
  const t = translations;
  try {
    // Validate input with Zod schema
    const validationResult = emailLoginSchema.safeParse(body);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors[0]?.message || "Invalid input";
      return createErrorResponse(400, errorMessage, t, event);
    }

    const { email, password } = validationResult.data;

    // Find user (connection already established by handler)
    const User = mongoose.model("User");
    const user = await User.findOne({ email, deleted: false });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return createErrorResponse(401, "emailLogin.invalidUserCredential", t, event);
    }

    const cookiePath = getCookiePath(event);

    // Handle NGO role
    if (user.role === "ngo") {
      const { password, ...userWithoutPassword } = user.toObject ? user.toObject() : user;
      return handleNGOLogin(userWithoutPassword, event, translations, cookiePath);
    }

    // Handle non-NGO role
    const token = issueUserAccessToken(user);

    const { token: newRefreshToken } = await createRefreshToken(user._id);

    return createSuccessResponse(
      200,
      event,
      {
        message: getTranslation(t, "emailLogin.success"),
        u_id: user._id,
        role: user.role,
        token,
        isVerified: user.verified,
        email: user.email,
      },
      {
        "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${process.env.REFRESH_TOKEN_MAX_AGE_SEC}`,
        "Access-Control-Allow-Credentials": "true",
      }
    );
  } catch (err) {
    return createErrorResponse(500, "Internal Server Error", t, event);
  }
}

/**
 * Checks if user exists by email or phone.
 * @param {RouteContext} routeContext
 */
async function checkUserExists({ event, translations, body }) {
  const t = translations;
  try {
    // Validate input with Zod schema
    const validationResult = checkUserExistsSchema.safeParse(body);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors[0]?.message || "Invalid input";
      return createErrorResponse(400, errorMessage, t, event);
    }

    const User = mongoose.model("User");
    const { email, phone } = validationResult.data;

    const query = {};
    if (email) query.email = email;
    if (phone) query.phoneNumber = phone;

    const user = await User.findOne({ ...query, deleted: false });

    if (!user) {
      return createSuccessResponse(200, event, { userId: "new user", newUser: true });
    }

    return createSuccessResponse(200, event, { userId: user._id, newUser: user.newUser });
  } catch (err) {
    return createErrorResponse(500, "Internal Server Error", t, event);
  }
}

module.exports = { emailLogin, checkUserExists };

