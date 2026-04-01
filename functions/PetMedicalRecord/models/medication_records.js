const mongoose = require("mongoose");

const MedicationRecordsSchema = new mongoose.Schema(
  {
    petId: {
        type: mongoose.Schema.Types.ObjectId
    },
    medicationDate: {
        type: Date,
        default: null,
    },
    drugName: {
        type: String,
        default: null,
    },
    drugPurpose: {
        type: String,
        default: null,
    },
    drugMethod: {
        type: String,
        default: null,
    },
    drugRemark: {
        type: String,
        default: null,
    },
    allergy: {
        type: Boolean,
        default: false,
    },
  },
  { timestamps: true }
); // Automatically manages createdAt and updatedAt

module.exports = MedicationRecordsSchema;