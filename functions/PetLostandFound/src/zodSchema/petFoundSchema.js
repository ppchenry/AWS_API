const { z } = require("zod");

const createPetFoundSchema = z.object({
  animal: z.string({ error: "petFound.errors.animalRequired" }).min(1, "petFound.errors.animalRequired"),
  breed: z.string().optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  ownerContact1: z.union([z.string(), z.number()]).optional(),
  foundDate: z.string({ error: "petFound.errors.foundDateRequired" }).min(1, "petFound.errors.foundDateRequired"),
  foundLocation: z.string({ error: "petFound.errors.foundLocationRequired" }).min(1, "petFound.errors.foundLocationRequired"),
  foundDistrict: z.string({ error: "petFound.errors.foundDistrictRequired" }).min(1, "petFound.errors.foundDistrictRequired"),
});

module.exports = { createPetFoundSchema };
