const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { userUpdatePasswordSchema, userUpdateImageSchema } = require("../zodSchema/userUpdateSchema");

async function updatePassword({ event, translations, body }) {
  try {
    const User = mongoose.model("User");
    
    // 1. Validation
    const parseResult = userUpdatePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, parseResult.error.errors[0].message, translations, event);
    }

    const { userId, oldPassword, newPassword } = parseResult.data;

    // 2. Logic: Check if passwords are the same BEFORE hitting the DB
    if (oldPassword === newPassword) {
      return createErrorResponse(400, "updatePassword.passwordUnchanged", translations, event);
    }

    // 3. Database Retrieval
    const user = await User.findOne({ _id: userId, deleted: false });
    if (!user) {
      return createErrorResponse(404, "updatePassword.userNotFound", translations, event);
    }

    // 4. Password Verification
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return createErrorResponse(400, "updatePassword.currentPasswordInvalid", translations, event);
    }

    // 5. Hashing & Saving (Using the .env SALT_ROUNDS)
    const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;
    user.password = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    return createSuccessResponse(200, event, {
      message: translations?.["updatePassword.success"] || "Password updated successfully",
    });

  } catch (e) {
    // This catches DB connection errors, hashing failures, etc.
    console.error("Update Password Error:", e);
    return createErrorResponse(500, e.message, translations, event);
  }
}

async function updateUserImage({ event, translations, body }) {
  try {
    const User = mongoose.model("User");

    const parseResult = userUpdateImageSchema.safeParse(body);
    if (!parseResult.success) {
      const zodError = parseResult.error.errors[0];
      return createErrorResponse(400, zodError.message, translations, event);
    }
    const { userId, image } = parseResult.data;
    // Check if user exists
    const userExists = await User.findOne({ _id: userId, deleted: false });
    if (!userExists) {
      return createErrorResponse(404, "updateImage.userNotFound", translations, event);
    }
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, deleted: false },
      { image },
      { new: true }
    );
    return createSuccessResponse(200, event, {
      success: true,
      message: translations ? translations["updateImage.success"] : "Image updated successfully",
      user: updatedUser,
    });
  } catch (e) {
    console.error("Error:", e.message);
    return createErrorResponse(500, e.message, translations, event);
  }
}

module.exports = { updatePassword, updateUserImage };  