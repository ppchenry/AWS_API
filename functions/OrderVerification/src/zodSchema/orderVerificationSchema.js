const { z } = require("zod");

const nullableTextField = z.string({ error: "orderVerification.errors.invalidField" }).trim().optional();

const supplierUpdateSchema = z.object({
  contact: nullableTextField,
  petName: nullableTextField,
  shortUrl: nullableTextField,
  masterEmail: nullableTextField,
  location: nullableTextField,
  petHuman: nullableTextField,
  pendingStatus: z.boolean({ error: "orderVerification.errors.invalidPendingStatus" }).optional(),
  updatedAt: z.union([
    z.string({ error: "orderVerification.errors.invalidDate" }).trim(),
    z.date({ error: "orderVerification.errors.invalidDate" }),
  ]).optional(),
  qrUrl: nullableTextField,
  petUrl: nullableTextField,
  petContact: nullableTextField,
  orderId: nullableTextField,
});

const tagUpdateSchema = z.object({
  staffVerification: z.boolean({ error: "orderVerification.errors.invalidStaffVerification" }).optional(),
  contact: nullableTextField,
  verifyDate: z.union([
    z.string({ error: "orderVerification.errors.invalidDate" }).trim(),
    z.date({ error: "orderVerification.errors.invalidDate" }),
  ]).optional(),
  petName: nullableTextField,
  shortUrl: nullableTextField,
  masterEmail: nullableTextField,
  orderId: nullableTextField,
  location: nullableTextField,
  petHuman: nullableTextField,
  createdAt: z.union([
    z.string({ error: "orderVerification.errors.invalidDate" }).trim(),
    z.date({ error: "orderVerification.errors.invalidDate" }),
  ]).optional(),
});

module.exports = {
  supplierUpdateSchema,
  tagUpdateSchema,
};
