const mongoose = require("mongoose");
const moment = require("moment");
const { performance } = require("perf_hooks");
const ApiLogSchema = require("./models/ApiLog.js");
const UserSchema = require("./models/Secret.js");

// MongoDB connection (cached)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    mongoose.model("ApiLog", ApiLogSchema, "api_log");
    mongoose.model("Users", UserSchema, "users");
  }
  return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const startTime = performance.now();

  try {
    // Get connection for reads
    const readConn = await getReadConnection();
    
    // Get models (using read connection)
    const ApiLog = readConn.model("ApiLog");
    const User = readConn.model("Users");

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      const endTime = performance.now();
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request body", time_taken: `${endTime - startTime} ms` }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }

    console.log("Parsed body:", body);

    const { dateTo, dateFrom, access_key, access_secret, userId, model_type } = body;

    if (!dateTo || !dateFrom || !access_key || !access_secret || !userId || !model_type) {
      const endTime = performance.now();
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing parameters, please refer to API documentation for the required parameters",
          time_taken: `${endTime - startTime} ms`,
        }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }

    // Validate date formats
    if (!moment(dateTo, "YYYY-MM-DD", true).isValid() || !moment(dateFrom, "YYYY-MM-DD", true).isValid()) {
      const endTime = performance.now();
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid date format, use YYYY-MM-DD", time_taken: `${endTime - startTime} ms` }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }

    const business = await User.findOne({ access_key, access_secret });
    if (!business) {
      const endTime = performance.now();
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Cannot find user with corresponding access key and secret key in the database. Incorrect access key and/or secret key",
          time_taken: `${endTime - startTime} ms`,
        }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }

    const effectiveUserId = business.business_name === "Pet pet club" ? userId : business._id;
    if (!mongoose.isValidObjectId(effectiveUserId)) {
      const endTime = performance.now();
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid userId", time_taken: `${endTime - startTime} ms` }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }

    const dateToParsed = new Date(moment(dateTo, "YYYY-MM-DD").add(1, "days"));
    const dateFromParsed = new Date(moment(dateFrom, "YYYY-MM-DD"));

    const totalLog = await ApiLog.find({
      error: { $exists: true },
      createdAt: { $gte: dateFromParsed, $lt: dateToParsed },
      userId: new mongoose.Types.ObjectId(effectiveUserId),
      model_type,
    });

    const numberOfCollection = await ApiLog.countDocuments({
      error: { $exists: true },
      createdAt: { $gte: dateFromParsed, $lt: dateToParsed },
      userId: new mongoose.Types.ObjectId(effectiveUserId),
    });

    const endTime = performance.now();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: totalLog, totalRecords: numberOfCollection, time_taken: `${endTime - startTime} ms` }),
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    };
  } catch (e) {
    console.error("Error:", e);
    const endTime = performance.now();
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message, time_taken: `${endTime - startTime} ms` }),
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    };
  }
};