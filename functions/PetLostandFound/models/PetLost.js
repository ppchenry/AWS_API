import mongoose from "mongoose";

const PetLostSchema = new mongoose.Schema(
  {
    // Pet Basic Info
    userId: {
      type: mongoose.Schema.Types.ObjectId, // reference to another collection (user)
    },
    petId : {
      type: String,
      default: null,
    },
    serial_number: {
      type: String,
      default: null,
    },
    lostDate: {
      type: Date,
      required: true,
      default: null,
    },
    lostLocation: {
      type: String,
      required: true,
      default: null,
    },
    lostDistrict: {
      type: String,
      required: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      default: null,
    },
    breedimage: {
      type: Array,
    },
    birthday: {
      type: Date,
      required: true,
      default: null,
    },
    weight: {
      type: Number,
      default: null,
    },
    sex: {
      type: String,
      required: true,
      default: null,
    },
    sterilization: {
      type: Boolean,
      default: null,
    },
    animal: {
      type: String,
      required: true,
      default: null,
    },
    breed: {
      type: String,
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
    strict: 'throw'
  }
); // Automatically manages createdAt and updatedAt

export default PetLostSchema;