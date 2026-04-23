const mongoose = require("mongoose");

const VaccineRecordsSchema = new mongoose.Schema(
  {
    petId: {
        type: mongoose.Schema.Types.ObjectId
    },
    vaccineDate: {
        type: Date,
        default: null,
    },
    vaccineName: {
        type: String,
        default: null,
    },
    vaccineNumber: {
        type: String,
        default: null,
    },
    vaccineTimes: {
        type: String,
        default: null,
    },
    vaccinePosition: {
        type: String,
        default: null,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
  },
  { timestamps: true }
); // Automatically manages createdAt and updatedAt

module.exports = VaccineRecordsSchema;