const mongoose = require("mongoose");
const OrderSchema = require("../models/Order");
const RateLimitSchema = require("../models/RateLimit");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

/**
 * Creates and caches the Lambda MongoDB connection.
 * Registers the Order and RateLimit models on first successful connect.
 *
 * @async
 * @returns {Promise<typeof mongoose>}
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
        extra: {
          database: "petpetclub",
        },
      });

      mongoose.models.Order || mongoose.model("Order", OrderSchema, "order");
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
 * Returns the shared read connection used by request handlers and services.
 *
 * @async
 * @returns {Promise<typeof mongoose>}
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

module.exports = {
  connectToMongoDB,
  getReadConnection,
};
