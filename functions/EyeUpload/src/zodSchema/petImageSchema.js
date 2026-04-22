const { z } = require("zod");

const MSG = {
  nameRequired: "eyeUpload.errors.nameRequired",
  animalRequired: "eyeUpload.errors.animalRequired",
  sexRequired: "eyeUpload.errors.sexRequired",
  petIdRequired: "eyeUpload.errors.petIdRequired",
  tooLong: "eyeUpload.errors.fieldTooLong",
  invalidUrl: "eyeUpload.errors.invalidUrl",
  unknownField: "eyeUpload.errors.unknownField",
};

const CREATE_ALLOWED_FIELDS = [
  "name",
  "animal",
  "sex",
  "breed",
  "birthday",
  "weight",
  "sterilization",
  "sterilizationDate",
  "adoptionStatus",
  "bloodType",
  "features",
  "info",
  "status",
  "owner",
  "ngoId",
  "ownerContact1",
  "ownerContact2",
  "contact1Show",
  "contact2Show",
  "receivedDate",
  "location",
  "position",
  "breedimage",
];

const UPDATE_ALLOWED_FIELDS = [
  "petId",
  "removedIndices",
  "name",
  "animal",
  "birthday",
  "weight",
  "sex",
  "sterilization",
  "sterilizationDate",
  "adoptionStatus",
  "breed",
  "bloodType",
  "features",
  "info",
  "status",
  "owner",
  "tagId",
  "ownerContact1",
  "ownerContact2",
  "contact1Show",
  "contact2Show",
  "receivedDate",
  "ngoId",
  "ngoPetId",
];

const CREATE_ALLOWED_FIELD_SET = new Set(CREATE_ALLOWED_FIELDS);
const UPDATE_ALLOWED_FIELD_SET = new Set(UPDATE_ALLOWED_FIELDS);

/**
 * Zod schema for POST /pets/create-pet-basic-info-with-image multipart fields.
 *
 * Only scalar string fields from lambda-multipart-parser are validated here.
 * File validation (type, size) is handled separately in the service.
 * All error messages are locale dot-keys per REFACTOR_CHECKLIST.
 */
const createPetWithImageSchema = z
  .object({
    name: z.string({ error: MSG.nameRequired }).min(1, MSG.nameRequired).max(200, MSG.tooLong),
    animal: z.string({ error: MSG.animalRequired }).min(1, MSG.animalRequired).max(100, MSG.tooLong),
    sex: z.string({ error: MSG.sexRequired }).min(1, MSG.sexRequired).max(20, MSG.tooLong),
    breed: z.string().max(200, MSG.tooLong).optional(),
    birthday: z.string().max(20, MSG.tooLong).optional(),
    weight: z.string().max(20, MSG.tooLong).optional(),
    sterilization: z.string().max(20, MSG.tooLong).optional(),
    sterilizationDate: z.string().max(20, MSG.tooLong).optional(),
    adoptionStatus: z.string().max(50, MSG.tooLong).optional(),
    bloodType: z.string().max(50, MSG.tooLong).optional(),
    features: z.string().max(2000, MSG.tooLong).optional(),
    info: z.string().max(5000, MSG.tooLong).optional(),
    status: z.string().max(50, MSG.tooLong).optional(),
    owner: z.string().max(200, MSG.tooLong).optional(),
    ngoId: z.string().max(100, MSG.tooLong).optional(),
    ownerContact1: z.string().max(200, MSG.tooLong).optional(),
    ownerContact2: z.string().max(200, MSG.tooLong).optional(),
    contact1Show: z.string().max(10, MSG.tooLong).optional(),
    contact2Show: z.string().max(10, MSG.tooLong).optional(),
    receivedDate: z.string().max(20, MSG.tooLong).optional(),
    location: z.string().max(500, MSG.tooLong).optional(),
    position: z.string().max(500, MSG.tooLong).optional(),
    breedimage: z.string().url(MSG.invalidUrl).optional(),
  })
  .passthrough()
  .superRefine((obj, ctx) => {
    for (const key of Object.keys(obj)) {
      if (!CREATE_ALLOWED_FIELD_SET.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: MSG.unknownField,
          path: [key],
        });
      }
    }
  })
  .transform((obj) => {
    const sanitized = {};
    for (const key of CREATE_ALLOWED_FIELDS) {
      if (obj[key] !== undefined) {
        sanitized[key] = obj[key];
      }
    }
    return sanitized;
  });

/**
 * Zod schema for POST /pets/updatePetImage multipart fields.
 *
 * petId is required; all other fields are optional updates.
 * Sensitive/privileged fields (isRegistered, userId, deleted, credit) are
 * explicitly excluded via .strict() — unknown keys are rejected.
 * All error messages are locale dot-keys per REFACTOR_CHECKLIST.
 */
const updatePetImageSchema = z
  .object({
    petId: z.string({ error: MSG.petIdRequired }).min(1, MSG.petIdRequired),
    removedIndices: z.string().max(5000, MSG.tooLong).optional(),
    name: z.string().max(200, MSG.tooLong).optional(),
    animal: z.string().max(100, MSG.tooLong).optional(),
    birthday: z.string().max(20, MSG.tooLong).optional(),
    weight: z.string().max(20, MSG.tooLong).optional(),
    sex: z.string().max(20, MSG.tooLong).optional(),
    sterilization: z.string().max(20, MSG.tooLong).optional(),
    sterilizationDate: z.string().max(20, MSG.tooLong).optional(),
    adoptionStatus: z.string().max(50, MSG.tooLong).optional(),
    breed: z.string().max(200, MSG.tooLong).optional(),
    bloodType: z.string().max(50, MSG.tooLong).optional(),
    features: z.string().max(2000, MSG.tooLong).optional(),
    info: z.string().max(5000, MSG.tooLong).optional(),
    status: z.string().max(50, MSG.tooLong).optional(),
    owner: z.string().max(200, MSG.tooLong).optional(),
    tagId: z.string().max(100, MSG.tooLong).optional(),
    ownerContact1: z.string().max(200, MSG.tooLong).optional(),
    ownerContact2: z.string().max(200, MSG.tooLong).optional(),
    contact1Show: z.string().max(10, MSG.tooLong).optional(),
    contact2Show: z.string().max(10, MSG.tooLong).optional(),
    receivedDate: z.string().max(20, MSG.tooLong).optional(),
    ngoId: z.string().max(100, MSG.tooLong).optional(),
    ngoPetId: z.string().max(100, MSG.tooLong).optional(),
  })
  .passthrough()
  .superRefine((obj, ctx) => {
    for (const key of Object.keys(obj)) {
      if (!UPDATE_ALLOWED_FIELD_SET.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: MSG.unknownField,
          path: [key],
        });
      }
    }
  })
  .transform((obj) => {
    const sanitized = {};
    for (const key of UPDATE_ALLOWED_FIELDS) {
      if (obj[key] !== undefined) {
        sanitized[key] = obj[key];
      }
    }
    return sanitized;
  });

module.exports = { createPetWithImageSchema, updatePetImageSchema };
