import mongoose from "mongoose";

const PetFoundSchema = new mongoose.Schema(
  {
    serial_number: {
      type: String,
      default: null,
    },
    foundDate: {
      type: Date,
      required: true,
      default: null,
    },
    foundLocation: {
      type: String,
      required: true,
      default: null,
    },
    foundDistrict: {
      type: String,
      required: true,
      default: null,
    },
    breedimage: {
      type: Array,
    },
    animal: {
      type: String,
      required: true,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    remarks: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      default: null,
    },
    owner: {
      type: String,
      default: null,
    },
    ownerContact1: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true,
  }
); // Automatically manages createdAt and updatedAt

export default PetFoundSchema;