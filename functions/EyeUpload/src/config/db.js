const mongoose = require("mongoose");
const { logInfo, logError } = require("../utils/logger");
const UserSchema = require("../models/User");
const ApiLogSchema = require("../models/ApiLog");
const EyeAnalysisLogSchema = require("../models/EyeAnalysisLog");
const ImageCollectionSchema = require("../models/ImageCollection");
const NgoCounterSchema = require("../models/NgoCounter");
const PetSchema = require("../models/Pet");
const RateLimitSchema = require("../models/RateLimit");

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

      logInfo("MongoDB connected", {
        scope: "config.db",
        extra: { database: "petpetclub" },
      });

      mongoose.models.User || mongoose.model("User", UserSchema, "users");
      mongoose.models.ApiLog || mongoose.model("ApiLog", ApiLogSchema, "api_logs");
      mongoose.models.EyeAnalysisLog || mongoose.model("EyeAnalysisLog", EyeAnalysisLogSchema, "eye_analysis_logs");
      mongoose.models.ImageCollection || mongoose.model("ImageCollection", ImageCollectionSchema, "image_collection");
      mongoose.models.NgoCounters || mongoose.model("NgoCounters", NgoCounterSchema, "ngo_counters");
      mongoose.models.Pets || mongoose.model("Pets", PetSchema, "pets");
      mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema, "rate_limits");

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
