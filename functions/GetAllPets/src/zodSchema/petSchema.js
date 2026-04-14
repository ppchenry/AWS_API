const { z } = require("zod");

const updatePetEyeSchema = z.object({
  petId: z.string({ error: "updatePetEye.missingRequiredFields" }).min(1, { message: "updatePetEye.missingRequiredFields" }),
  date: z.string({ error: "updatePetEye.missingRequiredFields" }).min(1, { message: "updatePetEye.missingRequiredFields" }),
  leftEyeImage1PublicAccessUrl: z.string({ error: "updatePetEye.missingRequiredFields" }).min(1, { message: "updatePetEye.missingRequiredFields" }),
  rightEyeImage1PublicAccessUrl: z.string({ error: "updatePetEye.missingRequiredFields" }).min(1, { message: "updatePetEye.missingRequiredFields" }),
}).strict();

const deletePetSchema = z.object({
  petId: z.string({ error: "deleteStatus.missingPetId" }).min(1, { message: "deleteStatus.missingPetId" }),
}).strict();

module.exports = { updatePetEyeSchema, deletePetSchema };
