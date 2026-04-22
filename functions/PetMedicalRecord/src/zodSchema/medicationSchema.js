const { z } = require("zod");

const createMedicationRecordSchema = z.object({
  medicationDate: z.string({ error: "petMedicalRecord.errors.medicationRecord.invalidDateFormat" }).optional(),
  drugName: z.string().optional(),
  drugPurpose: z.string().optional(),
  drugMethod: z.string().optional(),
  drugRemark: z.string().optional(),
  allergy: z.boolean().optional(),
}).strict();

const updateMedicationRecordSchema = z.object({
  medicationDate: z.string({ error: "petMedicalRecord.errors.medicationRecord.invalidDateFormat" }).optional(),
  drugName: z.string().optional(),
  drugPurpose: z.string().optional(),
  drugMethod: z.string().optional(),
  drugRemark: z.string().optional(),
  allergy: z.boolean().optional(),
}).strict();

module.exports = {
  createMedicationRecordSchema,
  updateMedicationRecordSchema,
};
