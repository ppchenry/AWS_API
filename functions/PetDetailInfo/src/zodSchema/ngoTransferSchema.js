const { z } = require("zod");

const ngoTransferSchema = z.object({
  UserEmail: z.string({ error: "petDetailInfo.errors.ngoTransfer.missingRequiredFields" }).min(1, "petDetailInfo.errors.ngoTransfer.missingRequiredFields"),
  UserContact: z.string({ error: "petDetailInfo.errors.ngoTransfer.missingRequiredFields" }).min(1, "petDetailInfo.errors.ngoTransfer.missingRequiredFields"),
  regDate: z.string().optional(),
  regPlace: z.string().optional(),
  transferOwner: z.string().optional(),
  transferContact: z.string().optional(),
  transferRemark: z.string().optional(),
  isTransferred: z.boolean().optional(),
});

module.exports = { ngoTransferSchema };
