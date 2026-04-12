const { z } = require("zod");
const {
  isValidDateFormat,
  isValidImageUrl,
} = require("../utils/validators");

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "breedimage",
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
  "ownerContact1",
  "ownerContact2",
  "contact1Show",
  "contact2Show",
  "isRegistered",
  "receivedDate",
  "location",
  "position",
];

const ALLOWED_UPDATE_FIELD_SET = new Set(ALLOWED_UPDATE_FIELDS);

const petBasicInfoUpdateSchema = z.object({
  name: z.string().optional(),
  breedimage: z.array(z.string().refine(isValidImageUrl, { message: "petBasicInfo.errors.invalidImageUrl" })).optional(),
  animal: z.string().optional(),
  birthday: z.string().refine(isValidDateFormat, { message: "petBasicInfo.errors.invalidBirthdayFormat" }).optional(),
  weight: z.number({ error: "petBasicInfo.errors.invalidWeightType" }).optional(),
  sex: z.string().optional(),
  sterilization: z.boolean({ error: "petBasicInfo.errors.invalidSterilizationType" }).optional(),
  sterilizationDate: z.string().refine(isValidDateFormat, { message: "petBasicInfo.errors.invalidsterilizationDateFormat" }).optional(),
  adoptionStatus: z.string().optional(),
  breed: z.string().optional(),
  bloodType: z.string().optional(),
  features: z.string().optional(),
  info: z.string().optional(),
  status: z.string().optional(),
  ownerContact1: z.number({ error: "petBasicInfo.errors.invalidOwnerContact1Type" }).optional(),
  ownerContact2: z.number({ error: "petBasicInfo.errors.invalidOwnerContact2Type" }).optional(),
  contact1Show: z.boolean({ error: "petBasicInfo.errors.invalidContact1ShowType" }).optional(),
  contact2Show: z.boolean({ error: "petBasicInfo.errors.invalidContact2ShowType" }).optional(),
  isRegistered: z.boolean({ error: "petBasicInfo.errors.invalidIsRegisteredType" }).optional(),
  receivedDate: z.string().refine(isValidDateFormat, { message: "petBasicInfo.errors.invalidReceivedDateFormat" }).optional(),
  location: z.string().optional(),
  position: z.string().optional(),
}).passthrough()
.superRefine((obj, ctx) => {
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_UPDATE_FIELD_SET.has(key)) {
      ctx.addIssue({
        code: "custom",
        message: "petBasicInfo.errors.invalidUpdateField",
        path: [key],
      });
    }
  }
})
.transform((obj) => {
  const sanitized = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (obj[key] !== undefined) {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
})
.refine(obj => Object.keys(obj).length > 0, {
  message: "petBasicInfo.errors.emptyUpdateBody"
});

module.exports = { petBasicInfoUpdateSchema };
