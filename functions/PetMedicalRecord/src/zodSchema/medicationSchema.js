const { z } = require("zod");

const createMedicationRecordSchema = z.object({
  medicationDate: z.string({ error: "medicationRecord.invalidDateFormat" }).optional(),
  drugName: z.string().optional(),
  drugPurpose: z.string().optional(),
  drugMethod: z.string().optional(),
  drugRemark: z.string().optional(),
  allergy: z.boolean().optional(),
});

const updateMedicationRecordSchema = z.object({
  medicationDate: z.string({ error: "medicationRecord.invalidDateFormat" }).optional(),
  drugName: z.string().optional(),
  drugPurpose: z.string().optional(),
  drugMethod: z.string().optional(),
  drugRemark: z.string().optional(),
  allergy: z.boolean().optional(),
});

module.exports = {
  createMedicationRecordSchema,
  updateMedicationRecordSchema,
};
