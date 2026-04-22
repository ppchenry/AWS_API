const { z } = require("zod");

/**
 * Zod schema for POST /purchase/confirmation (multipart form data).
 * All fields arrive as strings from lambda-multipart-parser.
 */
const purchaseConfirmationSchema = z.object({
  lastName: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields"),
  email: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields")
    .email("purchaseConfirmation.errors.purchase.invalidEmail"),
  address: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields"),
  option: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields")
    .max(64, "purchaseConfirmation.errors.purchase.invalidOption")
    .regex(/^[a-zA-Z0-9_-]+$/, "purchaseConfirmation.errors.purchase.invalidOption"),
  tempId: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields")
    .max(64, "purchaseConfirmation.errors.purchase.invalidTempId")
    .regex(/^[a-zA-Z0-9_-]+$/, "purchaseConfirmation.errors.purchase.invalidTempId"),
  paymentWay: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields")
    .max(128),
  delivery: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields")
    .max(128),
  petName: z
    .string({ error: "purchaseConfirmation.errors.purchase.missingRequiredFields" })
    .min(1, "purchaseConfirmation.errors.purchase.missingRequiredFields"),
  // Optional fields
  phoneNumber: z
    .string()
    .min(1, "purchaseConfirmation.errors.purchase.missingPhoneNumber")
    .regex(/^\d{7,15}$/, "purchaseConfirmation.errors.purchase.invalidPhone"),
  type: z.string().max(64).optional().default(""),
  shopCode: z
    .string({ error: "purchaseConfirmation.errors.purchase.invalidShopCode" })
    .min(1, "purchaseConfirmation.errors.purchase.invalidShopCode")
    .max(64),
  promotionCode: z.string().max(64).optional().default(""),
  petContact: z.string().optional().default(""),
  optionImg: z.string().optional().default(""),
  optionSize: z.string().max(32).optional().default(""),
  optionColor: z.string().max(64).optional().default(""),
  lang: z.enum(["chn", "eng"]).optional().default("eng"),
});

module.exports = { purchaseConfirmationSchema };
