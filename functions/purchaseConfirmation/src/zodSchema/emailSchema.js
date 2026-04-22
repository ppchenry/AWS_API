const { z } = require("zod");

/**
 * Zod schema for POST /purchase/send-ptag-detection-email
 */
const ptagDetectionEmailSchema = z.object({
  name: z
    .string({ error: "purchaseConfirmation.errors.email.missingFields" })
    .min(1, "purchaseConfirmation.errors.email.missingFields"),
  tagId: z
    .string({ error: "purchaseConfirmation.errors.email.missingFields" })
    .min(1, "purchaseConfirmation.errors.email.missingFields"),
  dateTime: z
    .string({ error: "purchaseConfirmation.errors.email.missingFields" })
    .min(1, "purchaseConfirmation.errors.email.missingFields"),
  locationURL: z
    .string({ error: "purchaseConfirmation.errors.email.missingFields" })
    .min(1, "purchaseConfirmation.errors.email.missingFields")
    .url("purchaseConfirmation.errors.email.invalidLocationURL")
    .refine((url) => url.startsWith("https://"), "purchaseConfirmation.errors.email.invalidLocationURL"),
  email: z
    .string({ error: "purchaseConfirmation.errors.email.missingFields" })
    .min(1, "purchaseConfirmation.errors.email.missingFields")
    .email("purchaseConfirmation.errors.email.invalidEmail"),
});

module.exports = { ptagDetectionEmailSchema };
