const mongoose = require("mongoose");
const AdoptionSchema = require("../models/Adoption");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

const connectToMongoDB = async () => {
  if (conn && mongoose.connection.readyState === 1) {
    return conn;
  }

  if (connPromise) {
    return connPromise;
  }

  connPromise = (async () => {
    try {
      conn = await mongoose.connect(process.env.NEW_MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      });

      logInfo("MongoDB primary connected", {
        scope: "config.db",
        extra: {
          database: "adoption_list",
        },
      });

      mongoose.models.Adoption || mongoose.model("Adoption", AdoptionSchema, "adoption_list");

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