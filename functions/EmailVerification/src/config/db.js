/**
 * @fileoverview MongoDB connection management for the EmailVerification Lambda.
 * Singleton Mongoose connection reused by warm Lambda invocations.
 */

const mongoose = require("mongoose");
const UserSchema = require("../models/User.js");
const RefreshTokenSchema = require("../models/RefreshToken.js");
const RateLimitSchema = require("../models/RateLimit.js");
const EmailVerificationCodeSchema = require("../models/EmailVerificationCode.js");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

/**
 * Creates and caches the Mongoose connection for the current Lambda runtime.
 * On first connection registers all schemas used by this function.
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

      mongoose.models.User ||
        mongoose.model("User", UserSchema, "users");
      mongoose.models.RefreshToken ||
        mongoose.model("RefreshToken", RefreshTokenSchema, "refresh_tokens");
      mongoose.models.RateLimit ||
        mongoose.model("RateLimit", RateLimitSchema, "rate_limits");
      mongoose.models.EmailVerificationCode ||
        mongoose.model("EmailVerificationCode", EmailVerificationCodeSchema, "email_verification_codes");

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
