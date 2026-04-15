const mongoose = require("mongoose");
const PetLostSchema = require("../models/PetLost");
const PetFoundSchema = require("../models/PetFound");
const NotificationSchema = require("../models/Notifications");
const PetSchema = require("../models/Pet");
const ImageCollectionSchema = require("../models/ImageCollection");
const RateLimitSchema = require("../models/RateLimit");
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

      mongoose.models.PetLost || mongoose.model("PetLost", PetLostSchema, "pet_lost");
      mongoose.models.PetFound || mongoose.model("PetFound", PetFoundSchema, "pet_found");
      mongoose.models.Notifications || mongoose.model("Notifications", NotificationSchema, "notifications");
      mongoose.models.Pets || mongoose.model("Pets", PetSchema, "pets");
      mongoose.models.ImageCollection || mongoose.model("ImageCollection", ImageCollectionSchema, "image_collection");
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

module.exports = {
  connectToMongoDB,
  getReadConnection,
};
