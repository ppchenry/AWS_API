const { z } = require("zod");

const createPetFoundSchema = z.object({
  animal: z.string({ error: "petLostAndFound.errors.petFound.animalRequired" }).min(1, "petLostAndFound.errors.petFound.animalRequired"),
  breed: z.string().optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  ownerContact1: z.union([z.string(), z.number()]).optional(),
  foundDate: z.string({ error: "petLostAndFound.errors.petFound.foundDateRequired" }).min(1, "petLostAndFound.errors.petFound.foundDateRequired"),
  foundLocation: z.string({ error: "petLostAndFound.errors.petFound.foundLocationRequired" }).min(1, "petLostAndFound.errors.petFound.foundLocationRequired"),
  foundDistrict: z.string({ error: "petLostAndFound.errors.petFound.foundDistrictRequired" }).min(1, "petLostAndFound.errors.petFound.foundDistrictRequired"),
});

module.exports = { createPetFoundSchema };
