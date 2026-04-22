const { z } = require("zod");
const { isValidEmail, isValidPhoneNumber } = require("../utils/validators");

const registerNgoSchema = z.object({
  firstName: z.string({ error: "userRoutes.errors.registerNgo.errors.firstNameRequired" }).min(1, "userRoutes.errors.registerNgo.errors.firstNameRequired"),
  lastName: z.string({ error: "userRoutes.errors.registerNgo.errors.lastNameRequired" }).min(1, "userRoutes.errors.registerNgo.errors.lastNameRequired"),
  email: z.string({ error: "userRoutes.errors.emailRegister.invalidEmailFormat" }).refine(isValidEmail, { message: "userRoutes.errors.emailRegister.invalidEmailFormat" }),
  phoneNumber: z.string({ error: "userRoutes.errors.emailRegister.invalidPhoneFormat" }).refine(isValidPhoneNumber, { message: "userRoutes.errors.emailRegister.invalidPhoneFormat" }),
  password: z.string({ error: "userRoutes.errors.registerNgo.errors.passwordRequired" }).min(8, "userRoutes.errors.registerNgo.errors.passwordRequired"),
  confirmPassword: z.string({ error: "userRoutes.errors.registerNgo.errors.confirmPasswordRequired" }).min(1, "userRoutes.errors.registerNgo.errors.confirmPasswordRequired"),
  ngoName: z.string({ error: "userRoutes.errors.registerNgo.errors.ngoNameRequired" }).min(1, "userRoutes.errors.registerNgo.errors.ngoNameRequired"),
  ngoPrefix: z.string({ error: "userRoutes.errors.registerNgo.errors.ngoPrefixTooLong" }).min(1).max(5, "userRoutes.errors.registerNgo.errors.ngoPrefixTooLong"),
  businessRegistrationNumber: z.string({ error: "userRoutes.errors.registerNgo.errors.businessRegRequired" }).min(1, "userRoutes.errors.registerNgo.errors.businessRegRequired"),
  address: z.string({ error: "userRoutes.errors.registerNgo.errors.addressRequired" }).min(1, "userRoutes.errors.registerNgo.errors.addressRequired"),
  description: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  subscribe: z.union([z.string(), z.boolean()]).optional(),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "userRoutes.errors.registerNgo.errors.passwordMismatch", path: ["confirmPassword"] }
);

module.exports = { registerNgoSchema };
