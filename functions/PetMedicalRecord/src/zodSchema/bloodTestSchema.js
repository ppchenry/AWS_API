const { z } = require("zod");

const createBloodTestSchema = z.object({
  bloodTestDate: z.string({ error: "bloodTest.invalidDateFormat" }).optional(),
  heartworm: z.string().optional(),
  lymeDisease: z.string().optional(),
  ehrlichiosis: z.string().optional(),
  anaplasmosis: z.string().optional(),
  babesiosis: z.string().optional(),
});

const updateBloodTestSchema = z.object({
  bloodTestDate: z.string({ error: "bloodTest.invalidDateFormat" }).optional(),
  heartworm: z.string().optional(),
  lymeDisease: z.string().optional(),
  ehrlichiosis: z.string().optional(),
  anaplasmosis: z.string().optional(),
  babesiosis: z.string().optional(),
});

module.exports = {
  createBloodTestSchema,
  updateBloodTestSchema,
};
