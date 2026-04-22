const { z } = require("zod");
const { isValidDateFormat, isValidImageUrl } = require("../utils/validators");

const optionalTrimmedString = () => z.string().trim().optional();
const optionalNonEmptyString = () => z.string().trim().min(1, "common.invalidInput").optional();

const ALLOWED_FIELDS = [
  "lang",
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
  "breedimage",
  "tagId",
  "receivedDate",
];

const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);

const createPetSchema = z
  .object({
    lang: optionalTrimmedString(),
    name: optionalTrimmedString(),
    birthday: optionalTrimmedString(),
    weight: z.number().finite().optional(),
    sex: optionalTrimmedString(),
    sterilization: z.boolean().optional(),
    animal: optionalTrimmedString(),
    breed: optionalTrimmedString(),
    features: optionalTrimmedString(),
    info: optionalTrimmedString(),
    status: optionalTrimmedString(),
    breedimage: z.array(z.string().trim()).optional(),
    tagId: optionalNonEmptyString(),
    receivedDate: optionalTrimmedString(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    Object.keys(body).forEach((key) => {
      if (!ALLOWED_FIELD_SET.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "createPetBasicInfo.errors.unknownField",
        });
      }
    });

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "createPetBasicInfo.errors.missingName" });
    }

    if (typeof body.birthday !== "string" || body.birthday.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["birthday"], message: "createPetBasicInfo.errors.missingBirthday" });
    } else if (!isValidDateFormat(body.birthday)) {
      ctx.addIssue({ code: "custom", path: ["birthday"], message: "createPetBasicInfo.errors.invalidDateFormat" });
    }

    if (typeof body.sex !== "string" || body.sex.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["sex"], message: "createPetBasicInfo.errors.missingSex" });
    }

    if (typeof body.animal !== "string" || body.animal.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["animal"], message: "createPetBasicInfo.errors.missingAnimal" });
    }

    if (body.receivedDate !== undefined && body.receivedDate !== null) {
      if (!isValidDateFormat(body.receivedDate)) {
        ctx.addIssue({ code: "custom", path: ["receivedDate"], message: "createPetBasicInfo.errors.invalidDateFormat" });
      }
    }

    if (body.breedimage !== undefined && body.breedimage !== null) {
      body.breedimage.forEach((url, index) => {
        if (url && !isValidImageUrl(url)) {
          ctx.addIssue({ code: "custom", path: ["breedimage", index], message: "createPetBasicInfo.errors.invalidImageUrlFormat" });
        }
      });
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
