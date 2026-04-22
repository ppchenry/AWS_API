const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");
const { normalizeEmail, normalizePhone } = require("../utils/validators");
const { sanitizeUser } = require("../utils/sanitize");
const { userUpdateDetailsSchema, deleteUserByEmailSchema } = require("../zodSchema/userUpdateSchema");

async function findActiveUserById(userId) {
  const User = mongoose.model("User");
  return User.findOne({ _id: userId, deleted: false }).lean();
}

/**
 * Returns the authenticated user's profile.
 * @param {RouteContext} routeContext
 */
async function getUserDetails({ event }) {
  const resolvedUser = await findActiveUserById(event.pathParameters?.userId);
  if (!resolvedUser) {
    return createErrorResponse(404, "userRoutes.errors.getUserNotFound", event);
  }

  return createSuccessResponse(200, event, {
    message: "Success",
    user: sanitizeUser(resolvedUser),
  });
}

/**
 * Validates and applies partial updates to a user's profile.
 * Checks for email/phone conflicts before persisting.
 * @param {RouteContext} routeContext
 */
async function updateUserDetails({ event, body }) {
  try {
    const User = mongoose.model("User");
    // Validate input using Zod schema
    const parseResult = userUpdateDetailsSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const { userId, firstName, lastName, birthday, email, district, image, phoneNumber } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhoneNumber = normalizePhone(phoneNumber);

    if (normalizedEmail || normalizedPhoneNumber) {
      const conflict = await User.findOne({
        $or: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(normalizedPhoneNumber ? [{ phoneNumber: normalizedPhoneNumber }] : [])
        ],
        _id: { $ne: userId },
        deleted: false
      }).lean();

      if (conflict) {
        const key = conflict.email === normalizedEmail ? "userRoutes.errors.emailExists" : "userRoutes.errors.phoneExists";
        return createErrorResponse(409, key, event);
      }
    }

    const updateFields = {};
    if (firstName !== undefined) updateFields.firstName = firstName;
    if (lastName !== undefined) updateFields.lastName = lastName;
    if (district !== undefined) updateFields.district = district;
    if (image !== undefined) updateFields.image = image;
    if (email !== undefined) updateFields.email = normalizedEmail;
    if (phoneNumber !== undefined) updateFields.phoneNumber = normalizedPhoneNumber;
    if (birthday !== undefined)  updateFields.birthday = birthday ? new Date(birthday) : null;

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, deleted: false },
      { $set: updateFields },
      { new: true, lean: true }
    );

    if (!updatedUser) {
      return createErrorResponse(404, "userRoutes.errors.putUserNotFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "Success",
      user: sanitizeUser(updatedUser),
    });
  } catch (err) {
    logError("User update failed", {
      scope: "services.user.updateUserDetails",
      event,
      error: err,
      extra: {
        userId: body?.userId,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Soft-deletes a user and revokes all their refresh tokens.
 * @param {RouteContext} routeContext
 */
async function deleteUser({ event }) {
  try {
    const User = mongoose.model("User");
    const RefreshToken = mongoose.model("RefreshToken");
    const resolvedUser = await findActiveUserById(event.pathParameters?.userId);

    if (!resolvedUser) {
      return createErrorResponse(404, "userRoutes.errors.getUserNotFound", event);
    }

    await Promise.all([
      User.updateOne({ _id: resolvedUser._id }, { deleted: true }),
      RefreshToken.deleteMany({ userId: resolvedUser._id }),
    ]);
    return createSuccessResponse(200, event, {
      message: "User deleted successfully",
      userId: resolvedUser._id,
    });
  } catch (err) {
    logError("User delete failed", {
      scope: "services.user.deleteUser",
      event,
      error: err,
      extra: {
        userId: event.pathParameters?.userId,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Soft-deletes a user account located by email and revokes all refresh tokens.
 * @param {RouteContext} routeContext
 */
async function deleteUserByEmail({ event, body }) {
  try {
    const User = mongoose.model("User");
    const RefreshToken = mongoose.model("RefreshToken");

    const parseResult = deleteUserByEmailSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const { email } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail }).lean();

    if (!user) {
      return createErrorResponse(404, "userRoutes.errors.deleteAccount.userNotFound", event);
    }

    if (user.deleted) {
      return createErrorResponse(409, "userRoutes.errors.deleteAccount.userAlreadyDeleted", event);
    }

    await Promise.all([
      User.updateOne({ _id: user._id }, { deleted: true }),
      RefreshToken.deleteMany({ userId: user._id }),
    ]);

    return createSuccessResponse(200, event, {
      message: "userRoutes.errors.deleteAccount.success",
      userId: user._id,
    });
  } catch (err) {
    logError("Delete user by email failed", {
      scope: "services.user.deleteUserByEmail",
      event,
      error: err,
      extra: {
        email: body?.email,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = {
  getUserDetails,
  updateUserDetails,
  deleteUser,
  deleteUserByEmail,
};
