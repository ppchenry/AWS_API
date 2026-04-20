const mongoose = require("mongoose");

const MedicalRecordsSchema = new mongoose.Schema(
  {
    petId: {
        type: mongoose.Schema.Types.ObjectId
    },
    medicalDate: {
        type: Date,
        default: null,
    },
    medicalPlace: {
        type: String,
        default: null,
    },
    medicalDoctor: {
        type: String,
        default: null,
    },
    medicalResult: {
        type: String,
        default: null,
    },
    medicalSolution: {
        type: String,
        default: null,
    },
  },
  { timestamps: true }
); // Automatically manages createdAt and updatedAt

module.exports = MedicalRecordsSchema;