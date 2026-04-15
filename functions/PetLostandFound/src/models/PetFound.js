const mongoose = require("mongoose");

const PetFoundSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
    },
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
    breed: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = PetFoundSchema;
