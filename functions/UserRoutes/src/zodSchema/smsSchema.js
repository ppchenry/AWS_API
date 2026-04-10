const { z } = require("zod");
const { isValidPhoneNumber } = require("../utils/validators");

const smsCodeSchema = z.object({
  phoneNumber: z.string({ error: "verification.invalidPhoneFormat" }).refine(isValidPhoneNumber, {
    message: "verification.invalidPhoneFormat",
  }),
});

const verifySmsCodeSchema = smsCodeSchema.extend({
  code: z.string({ error: "verification.missingCodeParams" }).min(1, { message: "verification.missingCodeParams" }),
});

module.exports = { smsCodeSchema, verifySmsCodeSchema };
