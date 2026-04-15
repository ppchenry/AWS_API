const { z } = require("zod");
const mongoose = require("mongoose");

const objectIdString = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  "petLost.errors.invalidPetId"
);

const createPetLostSchema = z.object({
  petId: objectIdString.optional(),
  name: z.string({ error: "petLost.errors.nameRequired" }).min(1, "petLost.errors.nameRequired"),
  birthday: z.string().optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  sex: z.string({ error: "petLost.errors.sexRequired" }).min(1, "petLost.errors.sexRequired"),
  sterilization: z.union([z.string(), z.boolean()]).optional(),
  animal: z.string({ error: "petLost.errors.animalRequired" }).min(1, "petLost.errors.animalRequired"),
  breed: z.string().optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  ownerContact1: z.union([z.string(), z.number()]).optional(),
  lostDate: z.string({ error: "petLost.errors.lostDateRequired" }).min(1, "petLost.errors.lostDateRequired"),
  lostLocation: z.string({ error: "petLost.errors.lostLocationRequired" }).min(1, "petLost.errors.lostLocationRequired"),
  lostDistrict: z.string({ error: "petLost.errors.lostDistrictRequired" }).min(1, "petLost.errors.lostDistrictRequired"),
});

module.exports = { createPetLostSchema };
