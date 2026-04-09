const { z } = require("zod");
const { isValidEmail, isValidPhoneNumber } = require("../utils/validators");

const registerNgoSchema = z.object({
  firstName: z.string().min(1, "registerNgo.errors.firstNameRequired"),
  lastName: z.string().min(1, "registerNgo.errors.lastNameRequired"),
  email: z.string().refine(isValidEmail, { message: "emailRegister.invalidEmailFormat" }),
  phoneNumber: z.string().refine(isValidPhoneNumber, { message: "emailRegister.invalidPhoneFormat" }),
  password: z.string().min(8, "registerNgo.errors.passwordRequired"),
  confirmPassword: z.string().min(1, "registerNgo.errors.confirmPasswordRequired"),
  ngoName: z.string().min(1, "registerNgo.errors.ngoNameRequired"),
  ngoPrefix: z.string().min(1).max(5, "registerNgo.errors.ngoPrefixTooLong"),
  businessRegistrationNumber: z.string().min(1, "registerNgo.errors.businessRegRequired"),
  address: z.string().min(1, "registerNgo.errors.addressRequired"),
  description: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  subscribe: z.union([z.string(), z.boolean()]).optional(),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "registerNgo.errors.passwordMismatch", path: ["confirmPassword"] }
);

module.exports = { registerNgoSchema };
