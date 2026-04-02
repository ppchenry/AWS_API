/**
 * @fileoverview MongoDB connection management for the PetBasicInfo Lambda.
 * Exposes a singleton Mongoose connection reused by warm Lambda invocations
 * and registers all application models on first connection.
 */

const mongoose = require("mongoose");
const PetSchema = require("../models/pet");
const eyeAnalysisLogSchema = require("../models/EyeAnalysisRecord");

let conn = null;
let connPromise = null;

/**
 * Creates and caches the Mongoose connection for the current Lambda runtime.
 * On first connection it also registers all schemas used by this function.
 * Reuses the same promise to avoid duplicate connection attempts during cold start.
 *
 * @async
 * @returns {Promise<typeof mongoose>} The cached Mongoose connection instance.
 */
const connectToMongoDB = async () => {
  if (conn && mongoose.connection.readyState === 1) {
    return conn;
  }

  if (connPromise) {
    return connPromise;
  }

  connPromise = (async () => {
    try {
      conn = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      });
      console.log("MongoDB primary connected to database: petpetclub");

      mongoose.model("Pet", PetSchema);
      mongoose.model("EyeAnalysisRecord", eyeAnalysisLogSchema, "eye_analysis_log");
      return conn;
    } catch (error) {
      connPromise = null;
      conn = null;
      console.error("MongoDB connection error:", error);
      throw new Error("Failed to connect to database");
    }
  })();

  return connPromise;
};

/**
 * Returns the cached read connection.
 * This currently shares the same singleton connection as writes.
 *
 * @async
 * @returns {Promise<typeof mongoose>} The cached Mongoose connection instance.
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

module.exports = {
  connectToMongoDB,
  getReadConnection,
};
