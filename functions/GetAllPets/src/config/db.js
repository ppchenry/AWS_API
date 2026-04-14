const mongoose = require("mongoose");
const PetSchema = require("../models/pet");
const RateLimitSchema = require("../models/RateLimit");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

/**
 * Establishes a singleton MongoDB connection. Reuses the existing connection
 * if already connected, or waits on an in-flight connection attempt.
 * @returns {Promise<import('mongoose').Mongoose>} The Mongoose connection instance
 * @throws {Error} If the connection fails
 */
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

      mongoose.models.Pet || mongoose.model("Pet", PetSchema, "pets");
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

/**
 * Returns a read-capable MongoDB connection (delegates to connectToMongoDB).
 * @returns {Promise<import('mongoose').Mongoose>} The Mongoose connection instance
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

module.exports = { connectToMongoDB, getReadConnection };
