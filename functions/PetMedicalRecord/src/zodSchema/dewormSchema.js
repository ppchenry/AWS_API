const { z } = require("zod");

const createDewormRecordSchema = z.object({
  date: z.string({ error: "dewormRecord.invalidDateFormat" }).optional(),
  vaccineBrand: z.string().optional(),
  vaccineType: z.string().optional(),
  typesOfInternalParasites: z.array(z.string()).optional(),
  typesOfExternalParasites: z.array(z.string()).optional(),
  frequency: z.number().optional(),
  nextDewormDate: z.string({ error: "dewormRecord.invalidDateFormat" }).optional(),
  notification: z.boolean().optional(),
});

const updateDewormRecordSchema = z.object({
  date: z.string({ error: "dewormRecord.invalidDateFormat" }).optional(),
  vaccineBrand: z.string().optional(),
  vaccineType: z.string().optional(),
  typesOfInternalParasites: z.array(z.string()).optional(),
  typesOfExternalParasites: z.array(z.string()).optional(),
  frequency: z.number().optional(),
  nextDewormDate: z.string({ error: "dewormRecord.invalidDateFormat" }).optional(),
  notification: z.boolean().optional(),
});

module.exports = {
  createDewormRecordSchema,
  updateDewormRecordSchema,
};
