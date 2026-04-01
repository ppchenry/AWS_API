const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { connectToMongoDB, getReadConnection } = require("../config/db");
const { isValidObjectId, isValidImageUrl } = require("../utils/validators");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { loadTranslations, getTranslation } = require("../helpers/i18n");
const { corsHeaders } = require("../cors");
const { tryParseJsonBody } = require("../utils/parseBody");

async function updatePassword(event, context) {
  const parsed = tryParseJsonBody(event);
  if (!parsed.ok) {
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);
    return createErrorResponse(400, "others.invalidJSON", t, event);
  }
  const body = parsed.body;

  const readConn = await getReadConnection();
  const User = readConn.model("User");
  const lang = event.cookies?.language || body.lang?.toLowerCase() || "zh";
  const t = loadTranslations(lang);
  const { userId, oldPassword, newPassword } = body;
  if (!userId || !isValidObjectId(userId) || !oldPassword || !newPassword) {
    return createErrorResponse(400, "updatePassword.paramsMissing", t, event);
  }
  if (newPassword.length < 8) {
    return createErrorResponse(400, "updatePassword.passwordLong", t, event);
  }
  const user = await User.findOne({ _id: userId });
  if (!user) {
    return createErrorResponse(400, "updatePassword.userNotFound", t, event);
  }
  const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
  if (!isPasswordValid) {
    return createErrorResponse(400, "updatePassword.currentPasswordInvalid", t, event);
  }
  if (oldPassword === newPassword) {
    return createErrorResponse(400, "updatePassword.passwordUnchanged", t, event);
  }
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
  user.password = hashedPassword;
  await user.save();
  return createSuccessResponse(200, event, {
    message: getTranslation(t, "updatePassword.success"),
  });
}

async function updateUserImage(event, context) {
  const readConn = await getReadConnection();
  console.log("IS UPDATE USER IMAGE FUNCTION");
      const UserRead = readConn.model("User");
      try {
        const parsed = tryParseJsonBody(event);
        if (!parsed.ok) {
          const lang = event.cookies?.language || "zh";
          const t = loadTranslations(lang);
          return createErrorResponse(400, "others.invalidJSON", t, event);
        }
        const form = parsed.body;
        const lang =
          event.cookies?.language || form.lang?.toLowerCase() || "zh";
        const t = loadTranslations(lang);

        if (!form.userId || !form.image) {
          return createErrorResponse(
            400,
            "others.missingParams",
            t,
            event
          );
        }

        // Validate user ID format
        if (!isValidObjectId(form.userId)) {
          return createErrorResponse(
            400,
            "updateImage.invalidUserId",
            t,
            event
          );
        }

        // Validate image URL format
        if (!isValidImageUrl(form.image)) {
          return createErrorResponse(
            400,
            "updateImage.invalidImageUrl",
            t,
            event
          );
        }

        // Check if user exists (using read connection)
        const userExists = await UserRead.findOne({ _id: form.userId });
        if (!userExists) {
          return createErrorResponse(
            404,
            "updateImage.userNotFound",
            t,
            event
          );
        }


        // Connect to primary database for writes
        await connectToMongoDB();
        const UserModel = mongoose.model("User");
        
        const updatedUser = await UserModel.findOneAndUpdate({ _id: form.userId },
          {
            image: form.image
          },
          { new: true }
        );

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message:
              getTranslation(t, "updateImage.success"),
            user: updatedUser,
          }),
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        };
      } catch (e) {
        console.error('Error:', e.message);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),
          },
          body: JSON.stringify({
            success: false,
            error: e.message
          }),
        };
      }
}

module.exports = { updatePassword, updateUserImage };  