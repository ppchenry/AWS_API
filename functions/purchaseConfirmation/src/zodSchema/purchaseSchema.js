const { z } = require("zod");

/**
 * Zod schema for POST /purchase/confirmation (multipart form data).
 * All fields arrive as strings from lambda-multipart-parser.
 */
const purchaseConfirmationSchema = z.object({
  lastName: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields"),
  email: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields")
    .email("purchase.errors.invalidEmail"),
  address: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields"),
  option: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields")
    .max(64, "purchase.errors.invalidOption")
    .regex(/^[a-zA-Z0-9_-]+$/, "purchase.errors.invalidOption"),
  tempId: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields")
    .max(64, "purchase.errors.invalidTempId")
    .regex(/^[a-zA-Z0-9_-]+$/, "purchase.errors.invalidTempId"),
  paymentWay: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields")
    .max(128),
  delivery: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields")
    .max(128),
  petName: z
    .string({ error: "purchase.errors.missingRequiredFields" })
    .min(1, "purchase.errors.missingRequiredFields"),
  // Optional fields
  phoneNumber: z
    .string()
    .min(1, "purchase.errors.missingPhoneNumber")
    .regex(/^\d{7,15}$/, "purchase.errors.invalidPhone"),
  type: z.string().max(64).optional().default(""),
  shopCode: z
    .string({ error: "purchase.errors.invalidShopCode" })
    .min(1, "purchase.errors.invalidShopCode")
    .max(64),
  promotionCode: z.string().max(64).optional().default(""),
  petContact: z.string().optional().default(""),
  optionImg: z.string().optional().default(""),
  optionSize: z.string().max(32).optional().default(""),
  optionColor: z.string().max(64).optional().default(""),
  lang: z.enum(["chn", "eng"]).optional().default("eng"),
});

module.exports = { purchaseConfirmationSchema };
