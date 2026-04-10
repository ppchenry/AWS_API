const { z } = require('zod');

/**
 * Schema for email login request body.
 */
const emailLoginSchema = z.object({
  email: z.string({ error: "emailLogin.invalidEmailFormat" }).email("emailLogin.invalidEmailFormat"),
  password: z.string({ error: "emailLogin.paramsMissing" }).min(1, "emailLogin.paramsMissing"),
});

/**
 * Schema for checkUserExists request body.
 * Requires either email or phone.
 */
const checkUserExistsSchema = z.object({
  email: z.string().email("emailLogin.invalidEmailFormat").optional(),
  phone: z.string().optional(),
}).refine(
  (data) => data.email || data.phone,
  "emailLogin.paramsMissing"
);

module.exports = {
  emailLoginSchema,
  checkUserExistsSchema,
};