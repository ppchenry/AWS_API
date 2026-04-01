const mongoose = require("mongoose");
const PetSchema = require("./models/pet.js");
const FeedbackSchema = require("./models/feedback.js");

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    // Register the schemas
    mongoose.model("Pet", PetSchema, "pets");
    mongoose.model("Feedback", FeedbackSchema, "feedback");
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
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Get connection for reads
    const readConn = await getReadConnection();

    // Parse the request body
    const form = JSON.parse(event.body || '{}');
    console.log("form:", form);

    // Validate required fields
    if (!form.userId || !form.petId || !form.rate || !form.functionName) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields",
          required: ["userId", "petId", "rate", "functionName"],
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Get the Pet model from read connection
    const Pet = readConn.model("Pet");

    // Verify pet exists (using read connection)
    const pet = await Pet.findOne({ _id: form.petId });
    if (!pet) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Pet not found" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Connect to primary database for writes
    await connectToMongoDB();
    const FeedbackModel = mongoose.model("Feedback");

    // Create new feedback in primary database
    const feedback = await FeedbackModel.create({
      userId: form.userId,
      petId: form.petId,
      rate: form.rate,
      feedback: form.feedback || "",
      functionName: form.functionName,
    });


    // Return the successful response
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Feedback created successfully",
        feedback: {
          id: feedback._id,
          userId: feedback.userId,
          petId: feedback.petId,
          rate: feedback.rate,
          feedback: feedback.feedback,
          functionName: feedback.functionName,
          createdAt: feedback.createdAt,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error creating feedback:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};