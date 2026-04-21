const { z } = require("zod");

const createOrderSchema = z.object({
  lastName: z.string({ error: "sfExpress.validation.lastNameRequired" }).min(1, "sfExpress.validation.lastNameRequired"),
  phoneNumber: z.string({ error: "sfExpress.validation.phoneNumberRequired" }).min(1, "sfExpress.validation.phoneNumberRequired"),
  address: z.string({ error: "sfExpress.validation.addressRequired" }).min(1, "sfExpress.validation.addressRequired"),
  count: z.coerce.number().int().positive().optional().default(1),
  attrName: z.string().optional(),
  netCode: z.string().optional(),
  tempId: z.string().optional(),
  tempIdList: z.array(z.string().min(1)).optional(),
}).strict();

const printCloudWaybillSchema = z.object({
  waybillNo: z.string({ error: "sfExpress.validation.waybillNoRequired" }).min(1, "sfExpress.validation.waybillNoRequired"),
}).strict();

const getAreaSchema = z.object({
  token: z.string({ error: "sfExpress.validation.tokenRequired" }).min(1, "sfExpress.validation.tokenRequired"),
}).strict();

const getNetCodeSchema = z.object({
  token: z.string({ error: "sfExpress.validation.tokenRequired" }).min(1, "sfExpress.validation.tokenRequired"),
  typeId: z.union([z.string(), z.number()], { error: "sfExpress.validation.typeIdRequired" }),
  areaId: z.union([z.string(), z.number()], { error: "sfExpress.validation.areaIdRequired" }),
}).strict();

const getPickupLocationsSchema = z.object({
  token: z.string({ error: "sfExpress.validation.tokenRequired" }).min(1, "sfExpress.validation.tokenRequired"),
  netCode: z.array(z.string().min(1), { error: "sfExpress.validation.netCodeListRequired" }).min(1, "sfExpress.validation.netCodeListRequired"),
  lang: z.string().default("en"),
}).strict();

module.exports = {
  createOrderSchema,
  printCloudWaybillSchema,
  getAreaSchema,
  getNetCodeSchema,
  getPickupLocationsSchema,
};
