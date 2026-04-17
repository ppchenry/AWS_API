const { z } = require("zod");

/**
 * Zod schema for POST /purchase/send-ptag-detection-email
 */
const ptagDetectionEmailSchema = z.object({
  name: z
    .string({ error: "email.errors.missingFields" })
    .min(1, "email.errors.missingFields"),
  tagId: z
    .string({ error: "email.errors.missingFields" })
    .min(1, "email.errors.missingFields"),
  dateTime: z
    .string({ error: "email.errors.missingFields" })
    .min(1, "email.errors.missingFields"),
  locationURL: z
    .string({ error: "email.errors.missingFields" })
    .min(1, "email.errors.missingFields")
    .url("email.errors.invalidLocationURL")
    .refine((url) => url.startsWith("https://"), "email.errors.invalidLocationURL"),
  email: z
    .string({ error: "email.errors.missingFields" })
    .min(1, "email.errors.missingFields")
    .email("email.errors.invalidEmail"),
});

module.exports = { ptagDetectionEmailSchema };
