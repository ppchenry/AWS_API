/**
 * @fileoverview MongoDB connection management for the UserRoutes Lambda.
 * Exposes a singleton Mongoose connection reused by warm Lambda invocations
 * and registers all application models on first connection.
 */

const mongoose = require("mongoose");
const UserSchema = require("../models/User.js");
const NgoUserAccessSchema = require("../models/NgoUserAccess.js");
const NGOSchema = require("../models/NGO.js");
const NGOCounterSchema = require("../models/NgoCounters.js");
const RefreshTokenSchema = require("../models/RefreshToken.js");
const RateLimitSchema = require("../models/RateLimit.js");
const SmsVerificationCodeSchema = require("../models/SmsVerificationCode.js");
const EmailVerificationCodeSchema = require("../models/EmailVerificationCode.js");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

/**
 * Creates and caches the Mongoose connection for the current Lambda runtime.
 * On first connection it also registers all schemas used by this function.
 * Caches the connection promise to prevent duplicate attempts during concurrent cold-start requests.
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
        extra: {
          database: "petpetclub",
        },
      });

      mongoose.models.User || mongoose.model("User", UserSchema, "users");
      mongoose.models.NgoUserAccess || mongoose.model("NgoUserAccess", NgoUserAccessSchema, "ngo_user_access");
      mongoose.models.NGO || mongoose.model("NGO", NGOSchema, "ngos");
      mongoose.models.RefreshToken || mongoose.model("RefreshToken", RefreshTokenSchema, "refresh_tokens");
      mongoose.models.NgoCounters || mongoose.model("NgoCounters", NGOCounterSchema, "ngo_counters");
      mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema, "rate_limits");
      mongoose.models.SmsVerificationCode || mongoose.model("SmsVerificationCode", SmsVerificationCodeSchema, "sms_verification_codes");
      mongoose.models.EmailVerificationCode || mongoose.model("EmailVerificationCode", EmailVerificationCodeSchema, "email_verification_codes");
    
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
