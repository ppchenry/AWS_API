/**
 * @fileoverview MongoDB connection factory shared across Lambda functions.
 * Returns a singleton-per-runtime connector that deduplicates concurrent
 * cold-start connection attempts and delegates model registration to the caller.
 *
 * Usage in each Lambda's config/db.js:
 *
 *   const { createDbConnector } = require('../../shared/config/db');
 *   const UserSchema = require('../models/User');
 *
 *   module.exports = createDbConnector((mongoose) => {
 *     mongoose.models.User || mongoose.model('User', UserSchema, 'users');
 *   });
 */

const mongoose = require("mongoose");
const { logInfo, logError } = require("../utils/logger");

/**
 * Creates a MongoDB connector with an isolated singleton for the calling Lambda.
 *
 * @param {(mongoose: typeof import("mongoose")) => void | Promise<void>} registerModels
 *   Called once after a successful connection to register all Mongoose models
 *   needed by this Lambda.
 * @returns {{ connectToMongoDB: () => Promise<typeof mongoose>, getReadConnection: () => Promise<typeof mongoose> }}
 */
function createDbConnector(registerModels) {
  let conn = null;
  let connPromise = null;

  /**
   * Creates and caches the Mongoose connection for the current Lambda runtime.
   * Reuses the existing connection when already established, or the in-flight
   * promise when a connection attempt is already underway.
   *
   * @async
   * @returns {Promise<typeof mongoose>} The cached Mongoose connection instance.
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

        await registerModels(mongoose);

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
   * Returns the cached read connection.
   * Currently shares the same singleton connection as writes.
   *
   * @async
   * @returns {Promise<typeof mongoose>} The cached Mongoose connection instance.
   */
  const getReadConnection = async () => {
    return await connectToMongoDB();
  };

  return { connectToMongoDB, getReadConnection };
}

module.exports = { createDbConnector };
