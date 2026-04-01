const mongoose = require("mongoose");

const BloodTestRecordsSchema = new mongoose.Schema(
  {
    petId: {
        type: mongoose.Schema.Types.ObjectId
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId
    },
    bloodTestDate: {
        type: Date,
        default: null,
    },
    heartworm: {
        type: String,
        default: null,
    },
    lymeDisease: {
        type: String,
        default: null,
    },
    ehrlichiosis: {
        type: String,
        default: null,
    },
    anaplasmosis: {
        type: String,
        default: null,
    },
    babesiosis: {
        type: String,
        default: null,
    },
  },
  { timestamps: true }
); // Automatically manages createdAt and updatedAt

module.exports = BloodTestRecordsSchema;