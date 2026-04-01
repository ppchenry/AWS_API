const mongoose = require("mongoose");

const DewormRecordsSchema = new mongoose.Schema(
  {
    petId: {
        type: mongoose.Schema.Types.ObjectId
    },
    date: {
        type: Date,
        default: null,
    },
    vaccineBrand: {
        type: String,
        default: null,
    },
    vaccineType: {
        type: String,
        default: null,
    },
    typesOfInternalParasites: [
        {
            type: String,
            default: null,
        },
    ],
    typesOfExternalParasites: [
        {
            type: String,
            default: null,
        },
    ],
    frequency: {
        type: Number,
        default: null,
    },
    nextDewormDate: {
        type: Date,
        default: null,
    },
    notification: {
        type: Boolean,
        default: false,
    },
  },
  { timestamps: true }
); // Automatically manages createdAt and updatedAt

module.exports = DewormRecordsSchema;