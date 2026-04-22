const { z } = require("zod");

const { isValidImageUrl, isValidObjectId } = require("../utils/validators");

const imageUrlField = z.string({ error: "petBiometricRoutes.errors.petBiometric.errors.imageArrayRequired" })
  .min(1, "petBiometricRoutes.errors.petBiometric.errors.imageArrayRequired")
  .refine((value) => isValidImageUrl(value), "petBiometricRoutes.errors.petBiometric.invalidImageUrl");

const imageArrayField = z.array(imageUrlField)
  .min(1, "petBiometricRoutes.errors.petBiometric.errors.imageArrayRequired");

const optionalImageArrayField = z.array(imageUrlField).optional().default([]);

const petIdField = z.string({ error: "petBiometricRoutes.errors.petBiometric.errors.petIdRequired" })
  .min(1, "petBiometricRoutes.errors.petBiometric.errors.petIdRequired")
  .refine((value) => isValidObjectId(value), "petBiometricRoutes.errors.invalidPetId");

const inlineFileSchema = z.object({
  filename: z.string({ error: "petBiometricRoutes.errors.petBiometric.errors.fileNameRequired" }).min(1, "petBiometricRoutes.errors.petBiometric.errors.fileNameRequired"),
  contentType: z.string({ error: "petBiometricRoutes.errors.petBiometric.errors.contentTypeRequired" }).min(1, "petBiometricRoutes.errors.petBiometric.errors.contentTypeRequired"),
  content: z.any({ error: "petBiometricRoutes.errors.petBiometric.errors.fileContentRequired" }),
});

const registerPetBiometricSchema = z.object({
  faceFrontArray: imageArrayField,
  faceLeftArray: imageArrayField,
  faceRightArray: imageArrayField,
  faceUpperArray: imageArrayField,
  faceLowerArray: imageArrayField,
  noseFrontArray: optionalImageArrayField,
  noseLeftArray: optionalImageArrayField,
  noseRightArray: optionalImageArrayField,
  noseUpperArray: optionalImageArrayField,
  noseLowerArray: optionalImageArrayField,
  petId: petIdField,
  userId: z.string().optional(),
  business: z.string().optional(),
});

const verifyPetBiometricSchema = z.object({
  userId: z.string().optional(),
  petId: petIdField,
  access_secret: z.string({ error: "petBiometricRoutes.errors.petBiometric.errors.accessKeyRequired" }).min(1, "petBiometricRoutes.errors.petBiometric.errors.accessKeyRequired"),
  secret_key: z.string({ error: "petBiometricRoutes.errors.petBiometric.errors.secretKeyRequired" }).min(1, "petBiometricRoutes.errors.petBiometric.errors.secretKeyRequired"),
  image_url: z.string().optional().refine(
    (value) => value === undefined || value === "" || isValidImageUrl(value),
    "petBiometricRoutes.errors.petBiometric.invalidImageUrl"
  ),
  animalType: z.string().optional(),
  files: z.array(inlineFileSchema).optional(),
}).refine(
  (value) => Boolean(value.image_url) || (Array.isArray(value.files) && value.files.length > 0),
  { message: "petBiometricRoutes.errors.imageRequired" }
);

module.exports = {
  registerPetBiometricSchema,
  verifyPetBiometricSchema,
};