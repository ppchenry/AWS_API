const { z } = require("zod");

const ngoTransferSchema = z.object({
  UserEmail: z.string({ error: "ngoTransfer.missingRequiredFields" }).min(1, "ngoTransfer.missingRequiredFields"),
  UserContact: z.string({ error: "ngoTransfer.missingRequiredFields" }).min(1, "ngoTransfer.missingRequiredFields"),
  regDate: z.string().optional(),
  regPlace: z.string().optional(),
  transferOwner: z.string().optional(),
  transferContact: z.string().optional(),
  transferRemark: z.string().optional(),
  isTransferred: z.boolean().optional(),
});

module.exports = { ngoTransferSchema };
