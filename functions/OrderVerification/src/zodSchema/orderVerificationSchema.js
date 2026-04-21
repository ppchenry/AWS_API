const { z } = require("zod");
const { parseDDMMYYYY } = require("../utils/validators");

const nullableTextField = z.string({ error: "orderVerification.errors.invalidField" }).trim().optional();

const validDateField = z.union([
  z.string({ error: "orderVerification.errors.invalidDate" }).trim().min(1, "orderVerification.errors.invalidDate"),
  z.date({ error: "orderVerification.errors.invalidDate" }),
]).refine((value) => parseDDMMYYYY(value) !== null, {
  message: "orderVerification.errors.invalidDate",
});

const supplierUpdateSchema = z.object({
  contact: nullableTextField,
  petName: nullableTextField,
  shortUrl: nullableTextField,
  masterEmail: nullableTextField,
  location: nullableTextField,
  petHuman: nullableTextField,
  pendingStatus: z.boolean({ error: "orderVerification.errors.invalidPendingStatus" }).optional(),
  qrUrl: nullableTextField,
  petUrl: nullableTextField,
  petContact: nullableTextField,
}).strict();

const tagUpdateSchema = z.object({
  contact: nullableTextField,
  verifyDate: validDateField.optional(),
  petName: nullableTextField,
  shortUrl: nullableTextField,
  masterEmail: nullableTextField,
  orderId: nullableTextField,
  location: nullableTextField,
  petHuman: nullableTextField,
}).strict();

module.exports = {
  supplierUpdateSchema,
  tagUpdateSchema,
};
