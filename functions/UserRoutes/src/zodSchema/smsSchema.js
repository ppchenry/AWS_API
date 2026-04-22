const { z } = require("zod");
const { isValidPhoneNumber } = require("../utils/validators");

const smsCodeSchema = z.object({
  phoneNumber: z.string({ error: "userRoutes.errors.verification.invalidPhoneFormat" }).refine(isValidPhoneNumber, {
    message: "userRoutes.errors.verification.invalidPhoneFormat",
  }),
});

const verifySmsCodeSchema = smsCodeSchema.extend({
  code: z.string({ error: "userRoutes.errors.verification.missingCodeParams" }).min(1, { message: "userRoutes.errors.verification.missingCodeParams" }),
});

module.exports = { smsCodeSchema, verifySmsCodeSchema };
