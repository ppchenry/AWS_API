const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { issueUserAccessToken, issueNgoAccessToken, createRefreshToken, buildRefreshCookie } = require("../utils/token");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { normalizeEmail, normalizePhone } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { enforceRateLimit } = require("../utils/rateLimit");
const { emailLoginSchema, checkUserExistsSchema } = require("../zodSchema/loginSchema");

/**
 * @typedef {Object} RouteContext
 * @property {import('aws-lambda').APIGatewayProxyEvent} event
 * @property {Object} body
 */

/**
 * Handles NGO user login logic.
 * @param {Object} request
 * @param {Object} request.user - The user object
 * @param {Object} request.event - The API Gateway event
 * @returns {Promise<Object>} Response object
 */
async function handleNGOLogin({ user, event }) {
  try {
    const NgoUserAccess = mongoose.model("NgoUserAccess");
    const NGO = mongoose.model("NGO");

    const ngoUserAccess = await NgoUserAccess.findOne({
      userId: user._id,
      isActive: true,
    });

    if (!ngoUserAccess) {
      return createErrorResponse(403, "userRoutes.errors.emailLogin.userNGONotFound", event);
    }

    const ngo = await NGO.findOne({ _id: ngoUserAccess.ngoId });
    if (!ngo) {
      return createErrorResponse(500, "userRoutes.errors.emailLogin.NGONotFound", event);
    }

    if (!ngo.isActive || !ngo.isVerified) {
      return createErrorResponse(403, "userRoutes.errors.emailLogin.ngoApprovalRequired", event);
    }

    const token = issueNgoAccessToken(user, ngo);

    const { token: newRefreshToken } = await createRefreshToken(user._id);

    return createSuccessResponse(
      200,
      event,
      {
        message: `Login successful ${ngo.name}`,
        userId: user._id,
        role: user.role,
        token,
        isVerified: user.verified,
      },
      {
        "Set-Cookie": buildRefreshCookie(newRefreshToken, event),
        "Access-Control-Allow-Credentials": "true",
      }
    );
  } catch (err) {
    logError("NGO login failed", {
      scope: "services.login.handleNGOLogin",
      event,
      error: err,
      extra: {
        userId: user?._id,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Handles email login for regular users and NGO users.
 * @param {RouteContext} routeContext
 */
async function emailLogin({ event, body }) {
  try {
    // Validate input with Zod schema
    const validationResult = emailLoginSchema.safeParse(body);
    if (!validationResult.success) {
      const errorMessage = getFirstZodIssueMessage(validationResult.error);
      return createErrorResponse(400, errorMessage, event);
    }

    const { password } = validationResult.data;
    const email = normalizeEmail(validationResult.data.email);

    const rateLimit = await enforceRateLimit({
      event,
      action: "login",
      identifier: email,
      limit: 10,
      windowSec: 15 * 60,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // Find user (connection already established by handler)
    const User = mongoose.model("User");
    const user = await User.findOne({ email, deleted: false });

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return createErrorResponse(401, "userRoutes.errors.emailLogin.invalidUserCredential", event);
    }

    // Handle NGO role
    if (user.role === "ngo") {
      const { password, ...userWithoutPassword } = user.toObject ? user.toObject() : user;
      return handleNGOLogin({ user: userWithoutPassword, event });
    }

    // Handle non-NGO role
    const token = issueUserAccessToken(user);

    const { token: newRefreshToken } = await createRefreshToken(user._id);

    return createSuccessResponse(
      200,
      event,
      {
        message: "Login successful",
        userId: user._id,
        role: user.role,
        token,
        isVerified: user.verified,
      },
      {
        "Set-Cookie": buildRefreshCookie(newRefreshToken, event),
        "Access-Control-Allow-Credentials": "true",
      }
    );
  } catch (err) {
    logError("Email login failed", {
      scope: "services.login.emailLogin",
      event,
      error: err,
      extra: {
        email: body?.email,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Checks if user exists by email or phone.
 * @param {RouteContext} routeContext
 */
async function checkUserExists({ event, body }) {
  try {
    // Validate input with Zod schema
    const validationResult = checkUserExistsSchema.safeParse(body);
    if (!validationResult.success) {
      const errorMessage = getFirstZodIssueMessage(validationResult.error);
      return createErrorResponse(400, errorMessage, event);
    }

    const User = mongoose.model("User");
    const email = normalizeEmail(validationResult.data.email);
    const phone = normalizePhone(validationResult.data.phone);

    const query = {};
    if (email) query.email = email;
    if (phone) query.phoneNumber = phone;

    const user = await User.findOne({ ...query, deleted: false })
      .select({ _id: 1 })
      .lean();

    if (!user) {
      return createSuccessResponse(200, event, { userId: "new user", newUser: true });
    }

    return createSuccessResponse(200, event, { userId: user._id, newUser: false });
  } catch (err) {
    logError("User existence check failed", {
      scope: "services.login.checkUserExists",
      event,
      error: err,
      extra: {
        email: body?.email,
        phone: body?.phone,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { emailLogin, checkUserExists };

