const mongoose = require("mongoose");

const PetSourceSchema = new mongoose.Schema(
  {
    petId: {
        type: mongoose.Schema.Types.ObjectId
    },
    placeofOrigin: {
        type: String,
        default: null,
    },
    channel: {
        type: String,
        default: null,
    },
    rescueCategory: {
        type: Array,
        default: [],
    },
    causeOfInjury: {
        type: String,
        default: null,
    },
  },
  { timestamps: true }
); // Automatically manages createdAt and updatedAt

module.exports = PetSourceSchema;
