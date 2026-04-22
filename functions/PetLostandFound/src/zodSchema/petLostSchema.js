const { z } = require("zod");
const mongoose = require("mongoose");

const objectIdString = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  "petLostAndFound.errors.petLost.invalidPetId"
);

const createPetLostSchema = z.object({
  petId: objectIdString.optional(),
  name: z.string({ error: "petLostAndFound.errors.petLost.nameRequired" }).min(1, "petLostAndFound.errors.petLost.nameRequired"),
  birthday: z.string().optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  sex: z.string({ error: "petLostAndFound.errors.petLost.sexRequired" }).min(1, "petLostAndFound.errors.petLost.sexRequired"),
  sterilization: z.union([z.string(), z.boolean()]).optional(),
  animal: z.string({ error: "petLostAndFound.errors.petLost.animalRequired" }).min(1, "petLostAndFound.errors.petLost.animalRequired"),
  breed: z.string().optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  ownerContact1: z.union([z.string(), z.number()]).optional(),
  lostDate: z.string({ error: "petLostAndFound.errors.petLost.lostDateRequired" }).min(1, "petLostAndFound.errors.petLost.lostDateRequired"),
  lostLocation: z.string({ error: "petLostAndFound.errors.petLost.lostLocationRequired" }).min(1, "petLostAndFound.errors.petLost.lostLocationRequired"),
  lostDistrict: z.string({ error: "petLostAndFound.errors.petLost.lostDistrictRequired" }).min(1, "petLostAndFound.errors.petLost.lostDistrictRequired"),
});

module.exports = { createPetLostSchema };
