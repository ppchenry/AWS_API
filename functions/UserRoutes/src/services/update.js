const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");
const { userUpdatePasswordSchema, userUpdateImageSchema } = require("../zodSchema/userUpdateSchema");

/**
 * Verifies the old password and updates to a new one.
 * @param {RouteContext} routeContext
 */
async function updatePassword({ event, body }) {
  try {
    const User = mongoose.model("User");
    
    // 1. Validation
    const parseResult = userUpdatePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const { userId, oldPassword, newPassword } = parseResult.data;

    // 2. Logic: Check if passwords are the same BEFORE hitting the DB
    if (oldPassword === newPassword) {
      return createErrorResponse(400, "updatePassword.passwordUnchanged", event);
    }

    // 3. Database Retrieval
    const user = await User.findOne({ _id: userId, deleted: false });
    if (!user) {
      return createErrorResponse(404, "updatePassword.userNotFound", event);
    }

    // 4. Password Verification
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return createErrorResponse(400, "updatePassword.currentPasswordInvalid", event);
    }

    // 5. Hashing & Saving (Using the .env SALT_ROUNDS)
    const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;
    user.password = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    return createSuccessResponse(200, event, {
      message: "Password updated successfully",
    });

  } catch (e) {
    // This catches DB connection errors, hashing failures, etc.
    logError("Password update failed", {
      scope: "services.update.updatePassword",
      event,
      error: e,
      extra: {
        userId: body?.userId,
      },
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Validates and updates the user's profile image URL.
 * @param {RouteContext} routeContext
 */
async function updateUserImage({ event, body }) {
  try {
    const User = mongoose.model("User");

    const parseResult = userUpdateImageSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const { userId, image } = parseResult.data;
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, deleted: false },
      { image },
      { new: true, lean: true }
    );
    if (!updatedUser) {
      return createErrorResponse(404, "updateImage.userNotFound", event);
    }
    return createSuccessResponse(200, event, {
      message: "Image updated successfully",
      user: updatedUser,
    });
  } catch (e) {
    logError("User image update failed", {
      scope: "services.update.updateUserImage",
      event,
      error: e,
      extra: {
        userId: body?.userId,
      },
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { updatePassword, updateUserImage };  