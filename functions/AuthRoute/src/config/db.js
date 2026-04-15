const mongoose = require("mongoose");
const UserSchema = require("../models/User");
const NgoUserAccessSchema = require("../models/NgoUserAccess");
const NGOSchema = require("../models/NGO");
const RefreshTokenSchema = require("../models/RefreshToken");
const RateLimitSchema = require("../models/RateLimit");
const env = require("./env");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

const connectToMongoDB = async () => {
  if (conn && mongoose.connection.readyState === 1) return conn;
  if (connPromise) return connPromise;

  connPromise = (async () => {
    try {
      conn = await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      });

      logInfo("MongoDB connected", {
        scope: "config.db",
        extra: {
          database: mongoose.connection.name,
        },
      });

      mongoose.models.User || mongoose.model("User", UserSchema, "users");
      mongoose.models.NgoUserAccess || mongoose.model("NgoUserAccess", NgoUserAccessSchema, "ngo_user_access");
      mongoose.models.NGO || mongoose.model("NGO", NGOSchema, "ngos");
      mongoose.models.RefreshToken || mongoose.model("RefreshToken", RefreshTokenSchema, "refresh_tokens");
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
