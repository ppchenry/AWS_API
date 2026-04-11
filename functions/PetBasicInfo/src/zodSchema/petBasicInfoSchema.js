const { z } = require("zod");
const {
  isValidDateFormat,
  isValidImageUrl,
} = require("../utils/validators");

const petBasicInfoUpdateSchema = z.object({
  name: z.string().optional(),
  breedimage: z.array(z.string().refine(isValidImageUrl, { message: "petBasicInfo.errors.invalidImageUrl" })).optional(),
  animal: z.string().optional(),
  birthday: z.string().refine(isValidDateFormat, { message: "petBasicInfo.errors.invalidBirthdayFormat" }).optional(),
  weight: z.number({ invalid_type_error: "petBasicInfo.errors.invalidWeightType" }).optional(),
  sex: z.string().optional(),
  sterilization: z.boolean({ invalid_type_error: "petBasicInfo.errors.invalidSterilizationType" }).optional(),
  sterilizationDate: z.string().refine(isValidDateFormat, { message: "petBasicInfo.errors.invalidsterilizationDateFormat" }).optional(),
  adoptionStatus: z.string().optional(),
  breed: z.string().optional(),
  bloodType: z.string().optional(),
  features: z.string().optional(),
  info: z.string().optional(),
  status: z.string().optional(),
  ownerContact1: z.number({ invalid_type_error: "petBasicInfo.errors.invalidOwnerContact1Type" }).optional(),
  ownerContact2: z.number({ invalid_type_error: "petBasicInfo.errors.invalidOwnerContact2Type" }).optional(),
  contact1Show: z.boolean({ invalid_type_error: "petBasicInfo.errors.invalidContact1ShowType" }).optional(),
  contact2Show: z.boolean({ invalid_type_error: "petBasicInfo.errors.invalidContact2ShowType" }).optional(),
  isRegistered: z.boolean({ invalid_type_error: "petBasicInfo.errors.invalidIsRegisteredType" }).optional(),
  receivedDate: z.string().refine(isValidDateFormat, { message: "petBasicInfo.errors.invalidReceivedDateFormat" }).optional(),
  location: z.string().optional(),
  position: z.string().optional(),
}).strict({ message: "petBasicInfo.errors.invalidUpdateField" })
.refine(obj => Object.keys(obj).length > 0, {
  message: "petBasicInfo.errors.emptyUpdateBody"
});

module.exports = { petBasicInfoUpdateSchema };
