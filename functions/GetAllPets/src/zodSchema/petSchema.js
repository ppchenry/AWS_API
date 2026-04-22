const { z } = require("zod");

const updatePetEyeSchema = z.object({
  petId: z.string({ error: "getAllPets.errors.updatePetEye.missingRequiredFields" }).min(1, { message: "getAllPets.errors.updatePetEye.missingRequiredFields" }),
  date: z.string({ error: "getAllPets.errors.updatePetEye.missingRequiredFields" }).min(1, { message: "getAllPets.errors.updatePetEye.missingRequiredFields" }),
  leftEyeImage1PublicAccessUrl: z.string({ error: "getAllPets.errors.updatePetEye.missingRequiredFields" }).min(1, { message: "getAllPets.errors.updatePetEye.missingRequiredFields" }),
  rightEyeImage1PublicAccessUrl: z.string({ error: "getAllPets.errors.updatePetEye.missingRequiredFields" }).min(1, { message: "getAllPets.errors.updatePetEye.missingRequiredFields" }),
}).strict();

const deletePetSchema = z.object({
  petId: z.string({ error: "getAllPets.errors.deleteStatus.missingPetId" }).min(1, { message: "getAllPets.errors.deleteStatus.missingPetId" }),
}).strict();

module.exports = { updatePetEyeSchema, deletePetSchema };
