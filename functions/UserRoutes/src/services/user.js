const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { userUpdateDetailsSchema } = require("../zodSchema/userUpdateSchema");

async function isGetUserDetails({ event, translations, user }) {
  return createSuccessResponse(200, event, {
    success: true,
    message: translations ? translations["others.getSuccess"] : "Success",
    user,
  });
}

async function isUpdateUserDetails({ event, translations, body }) {
  try {
    const User = mongoose.model("User");
    // Validate input using Zod schema
    const parseResult = userUpdateDetailsSchema.safeParse(body);
    if (!parseResult.success) {
      const zodError = parseResult.error.errors[0];
      return createErrorResponse(400, zodError.message, translations, event);
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
        return createErrorResponse(409, key, translations, event);
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
      return createErrorResponse(404, "others.putUserNotFound", translations, event);
    }

    return createSuccessResponse(200, event, {
      success: true,
      message: translations ? translations["others.putUserSuccess"] : "Success",
      user: updatedUser,
    });
  } catch (err) {
    console.error("isUpdateUserDetails error:", err);
    return createErrorResponse(500, "others.internalError", translations, event);
  }
}

async function isDeleteUser({ event, translations, user }) {
  try {
    const User = mongoose.model("User");
    await User.updateOne({ _id: user._id }, { deleted: true });
    return createSuccessResponse(200, event, {
      message: translations ? translations["others.deleteUserSuccess"] : "User deleted successfully",
      UserId: user._id,
    });
  } catch (err) {
    console.error("isDeleteUser error:", err);
    return createErrorResponse(500, "others.internalError", translations, event);
  }
}

module.exports = {
  isGetUserDetails,
  isUpdateUserDetails,
  isDeleteUser,
};
