const { z } = require("zod");

const MSG = {
  speciesRequired: "eyeUpload.speciesRequired",
  urlRequired: "eyeUpload.urlRequired",
  tooLong: "eyeUpload.fieldTooLong",
  invalidUrl: "eyeUpload.invalidUrl",
  unknownField: "eyeUpload.unknownField",
};

/**
 * Zod schema for POST /analysis/breed JSON body.
 * All error messages are locale dot-keys per REFACTOR_CHECKLIST.
 */
const breedAnalysisSchema = z
  .object({
    species: z.string({ required_error: MSG.speciesRequired }).min(1, MSG.speciesRequired).max(100, MSG.tooLong),
    url: z.string({ required_error: MSG.urlRequired }).min(1, MSG.urlRequired).url(MSG.invalidUrl),
  })
  .strict({ message: MSG.unknownField });

module.exports = { breedAnalysisSchema };
