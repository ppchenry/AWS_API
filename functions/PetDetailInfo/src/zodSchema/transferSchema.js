const { z } = require("zod");

const transferCreateSchema = z.object({
  regDate: z.string({ error: "transferPath.invalidDateFormat" }).optional(),
  regPlace: z.string().optional(),
  transferOwner: z.string().optional(),
  transferContact: z.string().optional(),
  transferRemark: z.string().optional(),
});

const transferUpdateSchema = z.object({
  regDate: z.string({ error: "transferPath.invalidDateFormat" }).optional(),
  regPlace: z.string().optional(),
  transferOwner: z.string().optional(),
  transferContact: z.string().optional(),
  transferRemark: z.string().optional(),
});

module.exports = { transferCreateSchema, transferUpdateSchema };
