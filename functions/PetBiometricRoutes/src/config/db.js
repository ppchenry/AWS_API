const mongoose = require("mongoose");

const ApiLogSchema = require("../models/ApiLog");
const ImageCollectionSchema = require("../models/ImageCollection");
const PetSchema = require("../models/Pet");
const PetFacialImageSchema = require("../models/PetFacialImage");
const RateLimitSchema = require("../models/RateLimit");
const UserBusinessSchema = require("../models/UserBusiness");
const { logError, logInfo } = require("../utils/logger");

let conn = null;
let connPromise = null;
let businessConn = null;
let businessConnPromise = null;

/**
 * Connects to the primary application database and registers Lambda-owned models.
 * Reuses both the active connection and the in-flight connection promise.
 *
 * @returns {Promise<typeof mongoose>}
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

      logInfo("MongoDB primary connected", {
        scope: "config.db",
        extra: {
          database: "petpetclub",
        },
      });

      mongoose.models.PetFacialImage || mongoose.model("PetFacialImage", PetFacialImageSchema, "pets_facial_image");
      mongoose.models.Pet || mongoose.model("Pet", PetSchema, "pets");
      mongoose.models.ApiLog || mongoose.model("ApiLog", ApiLogSchema, "api_log");
      mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema, "rate_limits");
      mongoose.models.ImageCollection || mongoose.model("ImageCollection", ImageCollectionSchema, "image_collections");

      return conn;
    } catch (error) {
      connPromise = null;
      conn = null;
      logError("MongoDB primary connection failed", {
        scope: "config.db",
        error,
      });
      throw new Error("Failed to connect to database");
    }
  })();

  return connPromise;
};

/**
 * Connects to the business database used for external access-key validation.
 *
 * @returns {Promise<import("mongoose").Connection>}
 */
const connectToBusinessMongoDB = async () => {
  if (businessConn && businessConn.readyState === 1) {
    return businessConn;
  }

  if (businessConnPromise) {
    return businessConnPromise;
  }

  businessConnPromise = (async () => {
    try {
      businessConn = await mongoose.createConnection(process.env.BUSINESS_MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      }).asPromise();

      logInfo("MongoDB business connected", {
        scope: "config.db",
        extra: {
          database: "business",
        },
      });

      businessConn.models.UserBusiness || businessConn.model("UserBusiness", UserBusinessSchema, "users");

      return businessConn;
    } catch (error) {
      businessConnPromise = null;
      businessConn = null;
      logError("MongoDB business connection failed", {
        scope: "config.db",
        error,
      });
      throw new Error("Failed to connect to business database");
    }
  })();

  return businessConnPromise;
};

/**
 * Returns the shared primary database connection for read paths.
 *
 * @returns {Promise<typeof mongoose>}
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

/**
 * Returns the shared business database connection.
 *
 * @returns {Promise<import("mongoose").Connection>}
 */
const getBusinessConnection = async () => {
  return await connectToBusinessMongoDB();
};

module.exports = {
  connectToMongoDB,
  getBusinessConnection,
  getReadConnection,
};