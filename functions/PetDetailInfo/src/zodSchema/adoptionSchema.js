const { z } = require("zod");

const adoptionCreateSchema = z.object({
  postAdoptionName: z.string().optional().nullable(),
  isNeutered: z.boolean().optional().nullable(),
  NeuteredDate: z.string({ error: "petDetailInfo.errors.petAdoption.invalidDateFormat" }).optional().nullable(),
  firstVaccinationDate: z.string().optional().nullable(),
  secondVaccinationDate: z.string().optional().nullable(),
  thirdVaccinationDate: z.string().optional().nullable(),
  followUpMonth1: z.boolean().optional(),
  followUpMonth2: z.boolean().optional(),
  followUpMonth3: z.boolean().optional(),
  followUpMonth4: z.boolean().optional(),
  followUpMonth5: z.boolean().optional(),
  followUpMonth6: z.boolean().optional(),
  followUpMonth7: z.boolean().optional(),
  followUpMonth8: z.boolean().optional(),
  followUpMonth9: z.boolean().optional(),
  followUpMonth10: z.boolean().optional(),
  followUpMonth11: z.boolean().optional(),
  followUpMonth12: z.boolean().optional(),
});

const adoptionUpdateSchema = adoptionCreateSchema;

module.exports = { adoptionCreateSchema, adoptionUpdateSchema };
