const { z } = require("zod");
const { isValidEmail, isValidPhoneNumber, isValidDateFormat, isValidImageUrl } = require("../utils/validators");

// Unified Zod schema for registration (email, phone, or both)
const registerSchema = z.object({
  firstName: z.string({ error: "userRoutes.errors.register.errors.firstNameRequired" }).min(1, "userRoutes.errors.register.errors.firstNameRequired"),
  lastName: z.string({ error: "userRoutes.errors.register.errors.lastNameRequired" }).min(1, "userRoutes.errors.register.errors.lastNameRequired"),
  // At least one of email or phoneNumber is required
  email: z.string().optional().or(z.literal("")).nullable().refine(
    (val) => !val || val === "" || isValidEmail(val),
    { message: "userRoutes.errors.register.errors.invalidEmailFormat" }
  ),
  phoneNumber: z.string().optional().or(z.literal("")).nullable().refine(
    (val) => !val || val === "" || isValidPhoneNumber(val),
    { message: "userRoutes.errors.register.errors.invalidPhoneFormat" }
  ),
  subscribe: z.union([z.string(), z.boolean()]).optional(),
  promotion: z.boolean().optional(),
  district: z.string().optional().nullable(),
  image: z.string().optional().nullable().refine(
    (val) => !val || val === "" || isValidImageUrl(val),
    { message: "userRoutes.errors.register.errors.invalidImageUrl" }
  ),
  birthday: z.string().optional().nullable().refine(
    (val) => !val || val === "" || isValidDateFormat(val),
    { message: "userRoutes.errors.register.errors.invalidBirthdayFormat" }
  ),
  gender: z.string().optional().nullable(),
}).refine(
  (data) => (data.email && data.email !== "") || (data.phoneNumber && data.phoneNumber !== ""),
  { message: "userRoutes.errors.register.errors.emailOrPhoneRequired" }
);

module.exports = { registerSchema };