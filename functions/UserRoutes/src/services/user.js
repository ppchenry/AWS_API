const mongoose = require("mongoose");
const { connectToMongoDB, getReadConnection } = require("../config/db");
const {
  isValidEmail,
  isValidPhoneNumber,
  isValidDateFormat,
} = require("../utils/validators");
const { createErrorResponse } = require("../utils/response");
const { loadTranslations, getTranslation } = require("../helpers/i18n");
const { tryParseJsonBody } = require("../utils/parseBody");

async function isGetUserDetails(event) {
  const readConn = await getReadConnection();
  const UserRead = readConn.model("User");
  const lang = event.cookies?.language || "zh";
  const t = loadTranslations(lang);

  const userId_toGet = event.pathParameters?.userId;
  if (!userId_toGet) {
    return createErrorResponse(400, "others.missingUserId", t, event);
  }
  if (!mongoose.isValidObjectId(userId_toGet)) {
    return createErrorResponse(400, "others.invalidGET", t, event);
  }
  const userData = await UserRead.findOne({ _id: userId_toGet });
  if (!userData) {
    return createErrorResponse(404, "others.getUserNotFound", t, event);
  }
  if (userData.deleted === true) {
    return createErrorResponse(410, "others.userDeleted", t, event);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      message: getTranslation(t, "others.getSuccess"),
      user: userData,
    }),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };
}

async function isUpdateUserDetails(event) {
  const readConn = await getReadConnection();
  const UserReadPut = readConn.model("User");
  const lang = event.cookies?.language || "zh";
  const t = loadTranslations(lang);

  const parsed = tryParseJsonBody(event);
  if (!parsed.ok) {
    return createErrorResponse(400, "others.invalidJSON", t, event);
  }
  const body = parsed.body;
  const { userId, firstName, lastName, birthday, email, district, image, phoneNumber } = body;

  if (!userId) {
    return createErrorResponse(400, "others.missingUserId", t, event);
  }
  if (!mongoose.isValidObjectId(userId)) {
    return createErrorResponse(400, "others.invalidPUT", t, event);
  }
  if (email && !isValidEmail(email)) {
    return createErrorResponse(400, "others.invalidEmailFormat", t, event);
  }
  if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
    return createErrorResponse(400, "others.invalidPhoneFormat", t, event);
  }
  if (birthday && !isValidDateFormat(birthday)) {
    return createErrorResponse(400, "others.invalidDateFormat", t, event);
  }

  if (email) {
    const existingUserWithEmail = await UserReadPut.findOne({
      email,
      _id: { $ne: userId },
    });
    if (existingUserWithEmail) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          success: false,
          error: getTranslation(t, "others.emailExists"),
          code: "EMAIL_EXISTS",
        }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }
  }
  if (phoneNumber) {
    const existingUserWithPhone = await UserReadPut.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });
    if (existingUserWithPhone) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          success: false,
          error: getTranslation(t, "others.phoneExists"),
          code: "PHONE_EXISTS",
        }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }
  }

  await connectToMongoDB();
  const UserModelPut = mongoose.model("User");
  const updatedUser = await UserModelPut.findOneAndUpdate(
    { _id: userId, deleted: false },
    {
      firstName,
      lastName,
      birthday: birthday ? new Date(birthday) : null,
      email,
      district,
      image,
      phoneNumber,
    },
    { new: true }
  );

  if (!updatedUser) {
    const deletedUser = await UserReadPut.findOne({ _id: userId, deleted: true });
    if (deletedUser) {
      return createErrorResponse(410, "others.userDeleted", t, event);
    }
    return createErrorResponse(404, "others.putUserNotFound", t, event);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      message: getTranslation(t, "others.putUserSuccess"),
      user: updatedUser,
    }),
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  };
}

async function isDeleteUser(event) {
  const readConn = await getReadConnection();
  const UserRead = readConn.model("User");
  const lang = event.cookies?.language || "zh";
  const t = loadTranslations(lang);

  const userId_to_delete = event.pathParameters?.userId;
  if (!userId_to_delete) {
    return createErrorResponse(400, "others.missingUserId", t, event);
  }
  if (!mongoose.isValidObjectId(userId_to_delete)) {
    return createErrorResponse(400, "others.invalidDELETE", t, event);
  }

  const userToDelete = await UserRead.findOne({ _id: userId_to_delete });
  if (!userToDelete) {
    return createErrorResponse(404, "others.userNotFound", t, event);
  }

  await connectToMongoDB();
  const UserModelDelete = mongoose.model("User");
  await UserModelDelete.deleteOne({ _id: userId_to_delete });

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: getTranslation(t, "others.deleteUserSuccess"),
      UserId: userId_to_delete,
    }),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };
}

module.exports = {
  isGetUserDetails,
  isUpdateUserDetails,
  isDeleteUser,
};
