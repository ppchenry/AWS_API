const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");
const { userUpdateDetailsSchema, deleteUserByEmailSchema } = require("../zodSchema/userUpdateSchema");

/**
 * Returns the authenticated user's profile.
 * @param {RouteContext} routeContext
 */
async function getUserDetails({ event, user }) {
  return createSuccessResponse(200, event, {
    message: "Success",
    user,
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

    if (email || phoneNumber) {
      const conflict = await User.findOne({
        $or: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : [])
        ],
        _id: { $ne: userId },
        deleted: false
      }).lean();

      if (conflict) {
        const key = conflict.email === email ? "others.emailExists" : "others.phoneExists";
        return createErrorResponse(409, key, event);
      }
    }

    const updateFields = {};
    if (firstName !== undefined) updateFields.firstName = firstName;
    if (lastName !== undefined) updateFields.lastName = lastName;
    if (district !== undefined) updateFields.district = district;
    if (image !== undefined) updateFields.image = image;
    if (email !== undefined) updateFields.email = email;
    if (phoneNumber !== undefined) updateFields.phoneNumber = phoneNumber;
    if (birthday !== undefined)  updateFields.birthday = birthday ? new Date(birthday) : null;

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, deleted: false },
      { $set: updateFields },
      { new: true, lean: true }
    );

    if (!updatedUser) {
      return createErrorResponse(404, "others.putUserNotFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "Success",
      user: updatedUser,
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
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Soft-deletes a user and revokes all their refresh tokens.
 * @param {RouteContext} routeContext
 */
async function deleteUser({ event, user }) {
  try {
    const User = mongoose.model("User");
    const RefreshToken = mongoose.model("RefreshToken");
    await Promise.all([
      User.updateOne({ _id: user._id }, { deleted: true }),
      RefreshToken.deleteMany({ userId: user._id }),
    ]);
    return createSuccessResponse(200, event, {
      message: "User deleted successfully",
      userId: user._id,
    });
  } catch (err) {
    logError("User delete failed", {
      scope: "services.user.deleteUser",
      event,
      error: err,
      extra: {
        userId: user?._id,
      },
    });
    return createErrorResponse(500, "others.internalError", event);
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
    const user = await User.findOne({ email }).lean();

    if (!user) {
      return createErrorResponse(404, "deleteAccount.userNotFound", event);
    }

    if (user.deleted) {
      return createErrorResponse(409, "deleteAccount.userAlreadyDeleted", event);
    }

    await Promise.all([
      User.updateOne({ _id: user._id }, { deleted: true }),
      RefreshToken.deleteMany({ userId: user._id }),
    ]);

    return createSuccessResponse(200, event, {
      message: "deleteAccount.success",
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
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getUserDetails,
  updateUserDetails,
  deleteUser,
  deleteUserByEmail,
};
