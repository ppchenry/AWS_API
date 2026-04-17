const mongoose = require("mongoose");
const PetSchema = require("../models/Pet");
const UserSchema = require("../models/User");
const PetSourceSchema = require("../models/PetSource");
const PetAdoptionSchema = require("../models/PetAdoption");
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

      mongoose.models.Pet || mongoose.model("Pet", PetSchema);
      mongoose.models.User || mongoose.model("User", UserSchema, "users");
      mongoose.models.pet_sources || mongoose.model("pet_sources", PetSourceSchema, "pet_sources");
      mongoose.models.pet_adoptions || mongoose.model("pet_adoptions", PetAdoptionSchema, "pet_adoptions");

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

module.exports = { connectToMongoDB, getReadConnection };
