const { z } = require("zod");
const { isValidEmail, isValidPhoneNumber } = require("../utils/validators");

const registerNgoSchema = z.object({
  firstName: z.string({ error: "registerNgo.errors.firstNameRequired" }).min(1, "registerNgo.errors.firstNameRequired"),
  lastName: z.string({ error: "registerNgo.errors.lastNameRequired" }).min(1, "registerNgo.errors.lastNameRequired"),
  email: z.string({ error: "emailRegister.invalidEmailFormat" }).refine(isValidEmail, { message: "emailRegister.invalidEmailFormat" }),
  phoneNumber: z.string({ error: "emailRegister.invalidPhoneFormat" }).refine(isValidPhoneNumber, { message: "emailRegister.invalidPhoneFormat" }),
  password: z.string({ error: "registerNgo.errors.passwordRequired" }).min(8, "registerNgo.errors.passwordRequired"),
  confirmPassword: z.string({ error: "registerNgo.errors.confirmPasswordRequired" }).min(1, "registerNgo.errors.confirmPasswordRequired"),
  ngoName: z.string({ error: "registerNgo.errors.ngoNameRequired" }).min(1, "registerNgo.errors.ngoNameRequired"),
  ngoPrefix: z.string({ error: "registerNgo.errors.ngoPrefixTooLong" }).min(1).max(5, "registerNgo.errors.ngoPrefixTooLong"),
  businessRegistrationNumber: z.string({ error: "registerNgo.errors.businessRegRequired" }).min(1, "registerNgo.errors.businessRegRequired"),
  address: z.string({ error: "registerNgo.errors.addressRequired" }).min(1, "registerNgo.errors.addressRequired"),
  description: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  subscribe: z.union([z.string(), z.boolean()]).optional(),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "registerNgo.errors.passwordMismatch", path: ["confirmPassword"] }
);

module.exports = { registerNgoSchema };
