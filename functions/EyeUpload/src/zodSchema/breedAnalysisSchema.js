const { z } = require("zod");

const MSG = {
  speciesRequired: "eyeUpload.errors.speciesRequired",
  urlRequired: "eyeUpload.errors.urlRequired",
  tooLong: "eyeUpload.errors.fieldTooLong",
  invalidUrl: "eyeUpload.errors.invalidUrl",
  unknownField: "eyeUpload.errors.unknownField",
};

const ALLOWED_FIELDS = ["species", "url"];
const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);

/**
 * Zod schema for POST /analysis/breed JSON body.
 * All error messages are locale dot-keys per REFACTOR_CHECKLIST.
 */
const breedAnalysisSchema = z
  .object({
    species: z.string({ error: MSG.speciesRequired }).min(1, MSG.speciesRequired).max(100, MSG.tooLong),
    url: z.string({ error: MSG.urlRequired }).min(1, MSG.urlRequired).url(MSG.invalidUrl),
  })
  .passthrough()
  .superRefine((obj, ctx) => {
    for (const key of Object.keys(obj)) {
      if (!ALLOWED_FIELD_SET.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: MSG.unknownField,
          path: [key],
        });
      }
    }
  })
  .transform((obj) => ({
    species: obj.species,
    url: obj.url,
  }));

module.exports = { breedAnalysisSchema };
