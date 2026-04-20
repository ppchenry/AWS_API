const { z } = require("zod");

const createMedicalRecordSchema = z.object({
  medicalDate: z.string({ error: "medicalRecord.invalidDateFormat" }).optional(),
  medicalPlace: z.string().optional(),
  medicalDoctor: z.string().optional(),
  medicalResult: z.string().optional(),
  medicalSolution: z.string().optional(),
}).strict();

const updateMedicalRecordSchema = z.object({
  medicalDate: z.string({ error: "medicalRecord.invalidDateFormat" }).optional(),
  medicalPlace: z.string().optional(),
  medicalDoctor: z.string().optional(),
  medicalResult: z.string().optional(),
  medicalSolution: z.string().optional(),
}).strict();

module.exports = {
  createMedicalRecordSchema,
  updateMedicalRecordSchema,
};
