const { z } = require("zod");
const { isValidDateFormat, isValidImageUrl } = require("../utils/validators");

const ALLOWED_FIELDS = [
  "lang",
  "userId",
  "name",
  "birthday",
  "weight",
  "sex",
  "sterilization",
  "animal",
  "breed",
  "features",
  "info",
  "status",
  "owner",
  "ngoId",
  "ngoPetId",
  "breedimage",
  "ownerContact1",
  "ownerContact2",
  "contact1Show",
  "contact2Show",
  "tagId",
  "receivedDate",
];

const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);

const createPetSchema = z
  .object({
    lang: z.any().optional(),
    userId: z.any().optional(),
    name: z.any(),
    birthday: z.any(),
    weight: z.any().optional(),
    sex: z.any(),
    sterilization: z.any().optional(),
    animal: z.any(),
    breed: z.any().optional(),
    features: z.any().optional(),
    info: z.any().optional(),
    status: z.any().optional(),
    owner: z.any().optional(),
    ngoId: z.any().optional(),
    ngoPetId: z.any().optional(),
    breedimage: z.any().optional(),
    ownerContact1: z.any().optional(),
    ownerContact2: z.any().optional(),
    contact1Show: z.any().optional(),
    contact2Show: z.any().optional(),
    tagId: z.any().optional(),
    receivedDate: z.any().optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    Object.keys(body).forEach((key) => {
      if (!ALLOWED_FIELD_SET.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "unknownField",
        });
      }
    });

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "missingName" });
    }

    if (typeof body.birthday !== "string" || body.birthday.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["birthday"], message: "missingBirthday" });
    } else if (!isValidDateFormat(body.birthday)) {
      ctx.addIssue({ code: "custom", path: ["birthday"], message: "invalidDateFormat" });
    }

    if (typeof body.sex !== "string" || body.sex.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["sex"], message: "missingSex" });
    }

    if (typeof body.animal !== "string" || body.animal.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["animal"], message: "missingAnimal" });
    }

    if (body.receivedDate !== undefined && body.receivedDate !== null) {
      if (typeof body.receivedDate !== "string" || !isValidDateFormat(body.receivedDate)) {
        ctx.addIssue({ code: "custom", path: ["receivedDate"], message: "invalidDateFormat" });
      }
    }

    if (body.weight !== undefined && body.weight !== null) {
      if (typeof body.weight !== "number" || Number.isNaN(body.weight)) {
        ctx.addIssue({ code: "custom", path: ["weight"], message: "invalidWeightFormat" });
      }
    }

    ["sterilization", "contact1Show", "contact2Show"].forEach((key) => {
      if (body[key] !== undefined && body[key] !== null && typeof body[key] !== "boolean") {
        ctx.addIssue({ code: "custom", path: [key], message: "invalidBooleanFormat" });
      }
    });

    if (body.breedimage !== undefined && body.breedimage !== null) {
      if (!Array.isArray(body.breedimage)) {
        ctx.addIssue({ code: "custom", path: ["breedimage"], message: "invalidBreedimageFormat" });
      } else {
        body.breedimage.forEach((url, index) => {
          if (url && !isValidImageUrl(url)) {
            ctx.addIssue({ code: "custom", path: ["breedimage", index], message: "invalidImageUrlFormat" });
          }
        });
      }
    }
  })
  .transform((body) => {
    const sanitized = {};

    ALLOWED_FIELDS.forEach((key) => {
      if (body[key] !== undefined) {
        sanitized[key] = body[key];
      }
    });

    return sanitized;
  });

module.exports = { createPetSchema };