import mongoose from "mongoose";

const PetSchema = new mongoose.Schema(
  {
    // Pet Basic Info
    userId: {
      type: mongoose.Schema.Types.ObjectId, // reference to another collection (user)
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
    sterilizationDate: {
      type: Date,
      default: null,
    },
    adoptionStatus: {
      type: String,
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
    bloodType: {
      type: String,
      default: null,
    },
    features: {
      type: String,
      default: null,
    },
    info: {
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
    tagId: {
      type: String,
      default: null,
    },
    ownerContact1: {
      type: Number,
      default: null,
    },
    ownerContact2: {
      type: Number,
      default: null,
    },
    contact1Show: {
      type: Boolean,
      default: false,
    },
    contact2Show: {
      type: Boolean,
      default: false,
    },
    receivedDate: {
      type: Date,
      default: null,
    },
    // Pet Detail Info
    chipId: {
      type: String,
      default: null,
    },
    placeOfBirth: {
      type: String,
      default: null,
    },
    transfer: [
      {
        regDate: {
          type: Date,
          default: null,
        },
        regPlace: {
          type: String,
          default: null,
        },
        transferOwner: {
          type: String,
          default: null,
        },
        transferContact: {
          type: String,
          default: null,
        },
        transferRemark: {
          type: String,
          default: null,
        },
      },
    ],
    motherName: {
      type: String,
      default: null,
    },
    motherBreed: {
      type: String,
      default: null,
    },
    motherDOB: {
      type: Date,
      default: null,
    },
    motherChip: {
      type: String,
      default: null,
    },
    motherPlaceOfBirth: {
      type: String,
      default: null,
    },
    motherParity: {
      type: Number,
      default: null,
    },
    fatherName: {
      type: String,
      default: null,
    },
    fatherBreed: {
      type: String,
    },
    fatherDOB: {
      type: Date,
      default: null,
    },
    fatherChip: {
      type: String,
      default: null,
    },
    fatherPlaceOfBirth: {
      type: String,
      default: null,
    },
    isRegistered: {
      type: Boolean,
      default: false,
    },
    eyeimages: {
      type: Array,
      default: [],
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    ngoId: {
      type: String,
    },
    ngoPetId: {
      type: String,
      default: 0
    },
    medicationRecordsCount: {
      type: Number,
      default: 0
    },
    medicalRecordsCount: {
      type: Number,
      default: 0
    },
    dewormRecordsCount: {
      type: Number,
      default: 0
    },
    vaccineRecordsCount: {
      type: Number,
      default: 0
    },
    latestDewormRecords: {
      type: Date,
      default: null
    },
    latestVaccineRecords: {
      type: Date,
      default: null
    },
    locationName: {
      type: String,
      default: ""
    },
    position: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
); // Automatically manages createdAt and updatedAt

export default PetSchema;