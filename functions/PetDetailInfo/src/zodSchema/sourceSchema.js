const { z } = require("zod");

const sourceCreateSchema = z.object({
  placeofOrigin: z.string().optional(),
  channel: z.string().optional(),
  rescueCategory: z.array(z.string()).optional(),
  causeOfInjury: z.string().optional(),
}).refine(
  (data) => data.placeofOrigin || data.channel,
  { message: "petSource.missingRequiredFields" }
);

const sourceUpdateSchema = z.object({
  placeofOrigin: z.string().optional(),
  channel: z.string().optional(),
  rescueCategory: z.array(z.string()).optional(),
  causeOfInjury: z.string().optional(),
});

module.exports = { sourceCreateSchema, sourceUpdateSchema };
