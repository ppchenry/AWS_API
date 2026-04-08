const { z } = require("zod");
const { isValidPhoneNumber } = require("../utils/validators");

const smsCodeSchema = z.object({
  phoneNumber: z.string().refine(isValidPhoneNumber, {
    message: "Invalid phone number format (must be E.164)",
  }),
});

const verifySmsCodeSchema = smsCodeSchema.extend({
  code: z.string().min(1, { message: "Verification code is required" }),
});

module.exports = { smsCodeSchema, verifySmsCodeSchema };
