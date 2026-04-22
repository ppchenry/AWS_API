const { z } = require("zod");

const nullableStringField = z.union([
  z.string().trim().min(1, "vaccineRecord.invalidInput"),
  z.null(),
]);

const vaccineRecordFields = {
  vaccineDate: nullableStringField.optional(),
  vaccineName: nullableStringField.optional(),
  vaccineNumber: nullableStringField.optional(),
  vaccineTimes: nullableStringField.optional(),
  vaccinePosition: nullableStringField.optional(),
};

const createVaccineRecordSchema = z.object(vaccineRecordFields);
const updateVaccineRecordSchema = z.object(vaccineRecordFields);

module.exports = {
  createVaccineRecordSchema,
  updateVaccineRecordSchema,
};