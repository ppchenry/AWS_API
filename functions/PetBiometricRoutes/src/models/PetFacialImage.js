const mongoose = require("mongoose");

const PetFacialImageSchema = new mongoose.Schema(
  {
    petId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    FaceImage: {
      FaceFront: { type: Array },
      FaceLeft: { type: Array },
      FaceRight: { type: Array },
      FaceUpper: { type: Array },
      FaceLower: { type: Array },
    },
    NoseImage: {
      NoseFront: { type: Array },
      NoseLeft: { type: Array },
      NoseRight: { type: Array },
      NoseUpper: { type: Array },
      NoseLower: { type: Array },
    },
    RegisteredFrom: {
      type: String,
    },
  },
  { timestamps: true }
);

PetFacialImageSchema.index({ petId: 1 }, { unique: true });

module.exports = PetFacialImageSchema;