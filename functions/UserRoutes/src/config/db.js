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

let conn = null;

/**
 * Creates and caches the Mongoose connection for the current Lambda runtime.
 * On first connection it also registers all schemas used by this function.
 *
 * @async
 * @returns {Promise<typeof mongoose>} The cached Mongoose connection instance.
 */
const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 1,
    });
    console.log("MongoDB connected to database: petpetclub");

    mongoose.model("User", UserSchema, "users");
    mongoose.model("NgoUserAccess", NgoUserAccessSchema, "ngo_user_access");
    mongoose.model("NGO", NGOSchema, "ngos");
    mongoose.model("RefreshToken", RefreshTokenSchema, "refresh_tokens");
    mongoose.model("NgoCounters", NGOCounterSchema, "ngo_counters");
  }
  return conn;
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
