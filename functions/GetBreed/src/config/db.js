const mongoose = require("mongoose");
const AnimalSchema = require("../models/AnimalList");
const ProductListSchema = require("../models/ProductList");
const DewormListSchema = require("../models/DewormList");
const EyeDiseaseListSchema = require("../models/Eye_disease");
const ProductLogSchema = require("../models/ProductLog");
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

      logInfo("MongoDB primary connected", {
        scope: "config.db",
        extra: { database: "petpetclub" },
      });

      mongoose.models.Animal || mongoose.model("Animal", AnimalSchema, "animal_list");
      mongoose.models.ProductList || mongoose.model("ProductList", ProductListSchema, "product");
      mongoose.models.Anthelmintic || mongoose.model("Anthelmintic", DewormListSchema, "anthelmintic");
      mongoose.models.EyeDiseaseList || mongoose.model("EyeDiseaseList", EyeDiseaseListSchema, "eye_disease");
      mongoose.models.ProductLog || mongoose.model("ProductLog", ProductLogSchema, "product_log");

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

module.exports = { connectToMongoDB, getReadConnection };
