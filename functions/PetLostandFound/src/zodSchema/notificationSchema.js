const { z } = require("zod");
const mongoose = require("mongoose");

const objectIdString = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  "petLostAndFound.errors.notifications.invalidPetId"
);

const createNotificationSchema = z.object({
  type: z.string({ error: "petLostAndFound.errors.notifications.typeRequired" }).min(1, "petLostAndFound.errors.notifications.typeRequired"),
  petId: objectIdString.optional().nullable(),
  petName: z.string().optional().nullable(),
  nextEventDate: z.string().optional().nullable(),
  nearbyPetLost: z.string().optional().nullable(),
});

module.exports = { createNotificationSchema };
