const mongoose = require("mongoose");
const PetSchema = require("../models/pet");
const MedicalRecordsSchema = require("../models/medical_records");
const MedicationRecordsSchema = require("../models/medication_records");
const DewormRecordsSchema = require("../models/deworm_records");
const BloodTestRecordsSchema = require("../models/bloodTest_records");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

const connectToMongoDB = async () => {
  if (conn && mongoose.connection.readyState === 1) return conn;
  if (connPromise) return connPromise;

  connPromise = (async () => {
    try {
      conn = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      });
      logInfo("MongoDB primary connected", {
        scope: "config.db",
        extra: { database: "petpetclub" },
      });

      mongoose.models.Pet ||
        mongoose.model("Pet", PetSchema, "pets");
      mongoose.models.Medical_Records ||
        mongoose.model("Medical_Records", MedicalRecordsSchema, "medical_records");
      mongoose.models.Medication_Records ||
        mongoose.model("Medication_Records", MedicationRecordsSchema, "medication_records");
      mongoose.models.Deworm_Records ||
        mongoose.model("Deworm_Records", DewormRecordsSchema, "deworm_records");
      mongoose.models.blood_tests ||
        mongoose.model("blood_tests", BloodTestRecordsSchema, "blood_tests");

      return conn;
    } catch (error) {
      connPromise = null;
      conn = null;
      logError("MongoDB connection failed", {
        scope: "config.db",
        error,
      });
      throw new Error("Failed to connect to database");
    }
  })();

  return connPromise;
};

const getReadConnection = async () => {
  return await connectToMongoDB();
};

module.exports = {
  connectToMongoDB,
  getReadConnection,
};
