const { z } = require("zod");
const { isValidObjectId, isValidImageUrl } = require("../utils/validators");
const { isValidEmail, isValidPhoneNumber, isValidDateFormat } = require("../utils/validators");

// Zod schema for updatePassword
const userUpdatePasswordSchema = z.object({
  userId: z.string().refine(isValidObjectId, { message: "updatePassword.invalidUserId" }),
  oldPassword: z.string().min(1, { message: "updatePassword.paramsMissing" }),
  newPassword: z.string().min(8, { message: "updatePassword.passwordLong" }),
});

// Zod schema for updateUserImage
const userUpdateImageSchema = z.object({
  userId: z.string().refine(isValidObjectId, { message: "updateImage.invalidUserId" }),
  image: z.string().refine(isValidImageUrl, { message: "updateImage.invalidImageUrl" }),
});

const userUpdateDetailsSchema = z.object({
  userId: z.string().refine(isValidObjectId, { message: "others.invalidPUT" }),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  birthday: z.string().refine(isValidDateFormat, { message: "others.invalidDateFormat" }).optional(),
  email: z.string().refine(isValidEmail, { message: "others.invalidEmailFormat" }).optional(),
  district: z.string().optional(),
  image: z.string().optional(),
  phoneNumber: z.string().refine(isValidPhoneNumber, { message: "others.invalidPhoneFormat" }).optional(),
});

const deleteUserByEmailSchema = z.object({
  email: z.string().refine(isValidEmail, { message: "deleteAccount.invalidEmailFormat" }),
});

module.exports = {
  userUpdatePasswordSchema,
  userUpdateImageSchema,
  userUpdateDetailsSchema,
  deleteUserByEmailSchema,
};
