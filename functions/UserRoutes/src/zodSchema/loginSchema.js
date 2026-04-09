const { z } = require('zod');

/**
 * Schema for email login request body.
 */
const emailLoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Schema for checkUserExists request body.
 * Requires either email or phone.
 */
const checkUserExistsSchema = z.object({
  email: z.string().email("Invalid email format").optional(),
  phone: z.string().optional(),
}).refine(
  (data) => data.email || data.phone,
  "Either email or phone is required"
);

module.exports = {
  emailLoginSchema,
  checkUserExistsSchema,
};