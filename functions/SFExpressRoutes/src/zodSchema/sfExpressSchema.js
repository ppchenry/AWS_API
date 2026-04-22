const { z } = require("zod");

const createOrderSchema = z.object({
  lastName: z.string({ error: "sfExpressRoutes.errors.validation.lastNameRequired" }).min(1, "sfExpressRoutes.errors.validation.lastNameRequired"),
  phoneNumber: z.string({ error: "sfExpressRoutes.errors.validation.phoneNumberRequired" }).min(1, "sfExpressRoutes.errors.validation.phoneNumberRequired"),
  address: z.string({ error: "sfExpressRoutes.errors.validation.addressRequired" }).min(1, "sfExpressRoutes.errors.validation.addressRequired"),
  count: z.coerce.number().int().positive().optional().default(1),
  attrName: z.string().optional(),
  netCode: z.string().optional(),
  tempId: z.string().optional(),
  tempIdList: z.array(z.string().min(1)).optional(),
}).strict();

const printCloudWaybillSchema = z.object({
  waybillNo: z.string({ error: "sfExpressRoutes.errors.validation.waybillNoRequired" }).min(1, "sfExpressRoutes.errors.validation.waybillNoRequired"),
}).strict();

const getAreaSchema = z.object({
  token: z.string({ error: "sfExpressRoutes.errors.validation.tokenRequired" }).min(1, "sfExpressRoutes.errors.validation.tokenRequired"),
}).strict();

const getNetCodeSchema = z.object({
  token: z.string({ error: "sfExpressRoutes.errors.validation.tokenRequired" }).min(1, "sfExpressRoutes.errors.validation.tokenRequired"),
  typeId: z.union([z.string(), z.number()], { error: "sfExpressRoutes.errors.validation.typeIdRequired" }),
  areaId: z.union([z.string(), z.number()], { error: "sfExpressRoutes.errors.validation.areaIdRequired" }),
}).strict();

const getPickupLocationsSchema = z.object({
  token: z.string({ error: "sfExpressRoutes.errors.validation.tokenRequired" }).min(1, "sfExpressRoutes.errors.validation.tokenRequired"),
  netCode: z.array(z.string().min(1), { error: "sfExpressRoutes.errors.validation.netCodeListRequired" }).min(1, "sfExpressRoutes.errors.validation.netCodeListRequired"),
  lang: z.string().default("en"),
}).strict();

module.exports = {
  createOrderSchema,
  printCloudWaybillSchema,
  getAreaSchema,
  getNetCodeSchema,
  getPickupLocationsSchema,
};
