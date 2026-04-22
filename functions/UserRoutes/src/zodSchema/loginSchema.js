const { z } = require('zod');

/**
 * Schema for email login request body.
 */
const emailLoginSchema = z.object({
  email: z.string({ error: "userRoutes.errors.emailLogin.invalidEmailFormat" }).email("userRoutes.errors.emailLogin.invalidEmailFormat"),
  password: z.string({ error: "userRoutes.errors.emailLogin.paramsMissing" }).min(1, "userRoutes.errors.emailLogin.paramsMissing"),
});

/**
 * Schema for checkUserExists request body.
 * Requires either email or phone.
 */
const checkUserExistsSchema = z.object({
  email: z.string().email("userRoutes.errors.emailLogin.invalidEmailFormat").optional(),
  phone: z.string().optional(),
}).refine(
  (data) => data.email || data.phone,
  "userRoutes.errors.emailLogin.paramsMissing"
);

module.exports = {
  emailLoginSchema,
  checkUserExistsSchema,
};