const { z } = require("zod");
const { isValidObjectId, isValidImageUrl } = require("../utils/validators");
const { isValidEmail, isValidPhoneNumber, isValidDateFormat } = require("../utils/validators");

// Zod schema for updatePassword
const userUpdatePasswordSchema = z.object({
  userId: z.string({ error: "userRoutes.errors.updatePassword.invalidUserId" }).refine(isValidObjectId, { message: "userRoutes.errors.updatePassword.invalidUserId" }),
  oldPassword: z.string({ error: "userRoutes.errors.updatePassword.paramsMissing" }).min(1, { message: "userRoutes.errors.updatePassword.paramsMissing" }),
  newPassword: z.string({ error: "userRoutes.errors.updatePassword.passwordLong" }).min(8, { message: "userRoutes.errors.updatePassword.passwordLong" }),
});

// Zod schema for updateUserImage
const userUpdateImageSchema = z.object({
  userId: z.string({ error: "userRoutes.errors.updateImage.invalidUserId" }).refine(isValidObjectId, { message: "userRoutes.errors.updateImage.invalidUserId" }),
  image: z.string({ error: "userRoutes.errors.updateImage.invalidImageUrl" }).refine(isValidImageUrl, { message: "userRoutes.errors.updateImage.invalidImageUrl" }),
});

const userUpdateDetailsSchema = z.object({
  userId: z.string({ error: "userRoutes.errors.invalidPUT" }).refine(isValidObjectId, { message: "userRoutes.errors.invalidPUT" }),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  birthday: z.string().refine(isValidDateFormat, { message: "common.invalidDateFormat" }).optional(),
  email: z.string().refine(isValidEmail, { message: "common.invalidEmailFormat" }).optional(),
  district: z.string().optional(),
  image: z.string().optional(),
  phoneNumber: z.string().refine(isValidPhoneNumber, { message: "common.invalidPhoneFormat" }).optional(),
});

const deleteUserByEmailSchema = z.object({
  email: z.string().refine(isValidEmail, { message: "userRoutes.errors.deleteAccount.invalidEmailFormat" }),
});

module.exports = {
  userUpdatePasswordSchema,
  userUpdateImageSchema,
  userUpdateDetailsSchema,
  deleteUserByEmailSchema,
};
