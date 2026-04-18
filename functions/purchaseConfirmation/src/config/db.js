const mongoose = require("mongoose");
const OrderSchema = require("../models/Order");
const OrderVerificationSchema = require("../models/OrderVerification");
const ShopInfoSchema = require("../models/ShopInfo");
const ImageCollectionSchema = require("../models/ImageCollection");
const RateLimitSchema = require("../models/RateLimit");
const { logInfo, logError } = require("../utils/logger");

let conn = null;
let connPromise = null;

const connectToMongoDB = async () => {
  if (conn && mongoose.connection.readyState === 1) return conn;
  if (connPromise) return connPromise;

  connPromise = (async () => {
    try {
      conn = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      });

      logInfo("MongoDB connected", { scope: "config.db", extra: { database: "petpetclub" } });

      mongoose.models.Order || mongoose.model("Order", OrderSchema, "order");
      mongoose.models.OrderVerification || mongoose.model("OrderVerification", OrderVerificationSchema, "orderVerification");
      mongoose.models.ShopInfo || mongoose.model("ShopInfo", ShopInfoSchema, "shopInfo");
      mongoose.models.ImageCollection || mongoose.model("ImageCollection", ImageCollectionSchema, "imageCollection");
      mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema, "rate_limits");

      return conn;
    } catch (error) {
      connPromise = null;
      conn = null;
      logError("MongoDB connection failed", { scope: "config.db", error });
      throw new Error("Failed to connect to database");
    }
  })();

  return connPromise;
};

const getReadConnection = async () => connectToMongoDB();

module.exports = { connectToMongoDB, getReadConnection };
