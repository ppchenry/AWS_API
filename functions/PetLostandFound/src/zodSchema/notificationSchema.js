const { z } = require("zod");
const mongoose = require("mongoose");

const objectIdString = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  "notifications.errors.invalidPetId"
);

const createNotificationSchema = z.object({
  type: z.string({ error: "notifications.errors.typeRequired" }).min(1, "notifications.errors.typeRequired"),
  petId: objectIdString.optional().nullable(),
  petName: z.string().optional().nullable(),
  nextEventDate: z.string().optional().nullable(),
  nearbyPetLost: z.string().optional().nullable(),
});

module.exports = { createNotificationSchema };
