const { z } = require("zod");
const { isValidEmail, isValidPhoneNumber, isValidDateFormat, isValidImageUrl } = require("../utils/validators");

// Unified Zod schema for registration (email, phone, or both)
const registerSchema = z.object({
  firstName: z.string().min(1, "register.errors.firstNameRequired"),
  lastName: z.string().min(1, "register.errors.lastNameRequired"),
  password: z.string().min(8, "register.errors.passwordRequired"),
  // At least one of email or phoneNumber is required
  email: z.string().optional().or(z.literal("")).nullable().refine(
    (val) => !val || val === "" || isValidEmail(val),
    { message: "register.errors.invalidEmailFormat" }
  ),
  phoneNumber: z.string().optional().or(z.literal("")).nullable().refine(
    (val) => !val || val === "" || isValidPhoneNumber(val),
    { message: "register.errors.invalidPhoneFormat" }
  ),
  role: z.string().optional(),
  subscribe: z.union([z.string(), z.boolean()]).optional(),
  promotion: z.boolean().optional(),
  district: z.string().optional().nullable(),
  image: z.string().optional().nullable().refine(
    (val) => !val || val === "" || isValidImageUrl(val),
    { message: "register.errors.invalidImageUrl" }
  ),
  birthday: z.string().optional().nullable().refine(
    (val) => !val || val === "" || isValidDateFormat(val),
    { message: "register.errors.invalidBirthdayFormat" }
  ),
  gender: z.string().optional().nullable(),
}).refine(
  (data) => (data.email && data.email !== "") || (data.phoneNumber && data.phoneNumber !== ""),
  { message: "register.errors.emailOrPhoneRequired" }
);

module.exports = { registerSchema };