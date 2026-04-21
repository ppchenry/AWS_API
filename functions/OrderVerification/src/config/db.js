const mongoose = require("mongoose");
const orderVerificationSchema = require("../models/OrderVerification");
const orderSchema = require("../models/Order");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

/**
 * Creates or reuses the singleton MongoDB connection for this Lambda runtime.
 *
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
        extra: { database: "petpetclub" },
      });

      mongoose.models.OrderVerification || mongoose.model("OrderVerification", orderVerificationSchema, "orderVerification");
      mongoose.models.Order || mongoose.model("Order", orderSchema, "order");

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
 * Returns the shared connection used by read flows.
 *
 * @returns {Promise<typeof mongoose>}
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

module.exports = {
  connectToMongoDB,
  getReadConnection,
};
