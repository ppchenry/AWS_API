const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    petId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pet",
      required: true,
    },
    animal: {
      type: String,
      trim: true,
    },
    feedback: {
      type: String,
      trim: true,
    },
    rate: {
      type: Number,
    },
    functionName: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = feedbackSchema;
