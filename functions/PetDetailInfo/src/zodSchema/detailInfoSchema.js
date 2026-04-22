const { z } = require("zod");

const detailInfoUpdateSchema = z.object({
  chipId: z.string().optional(),
  placeOfBirth: z.string().optional(),
  motherName: z.string().optional(),
  motherBreed: z.string().optional(),
  motherDOB: z.string({ error: "petDetailInfo.errors.invalidDateFormat" }).optional(),
  motherChip: z.string().optional(),
  motherPlaceOfBirth: z.string().optional(),
  motherParity: z.coerce.number({ error: "petDetailInfo.errors.invalidMotherParity" }).optional(),
  fatherName: z.string().optional(),
  fatherBreed: z.string().optional(),
  fatherDOB: z.string({ error: "petDetailInfo.errors.invalidDateFormat" }).optional(),
  fatherChip: z.string().optional(),
  fatherPlaceOfBirth: z.string().optional(),
});

module.exports = { detailInfoUpdateSchema };
