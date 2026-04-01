const mongoose = require("mongoose");
const AdoptionSchema = require("./models/Adoption.js");
const AdoptionRecordSchema = require("./models/AdoptionRecord.js");

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.NEW_MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected");
    // Register schemas
    mongoose.model("Adoption", AdoptionSchema, "adoption_list");
    mongoose.model("AdoptionRecord", AdoptionRecordSchema, "adoption_record");
  }
  return conn;
};

exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Connect to MongoDB
    await connectToMongoDB();

    // Get models
    const Adoption = mongoose.model("Adoption");
    const AdoptionRecord = mongoose.model("AdoptionRecord");

    const httpMethod = event.httpMethod;
    const resource = event.resource;
    const id = event.pathParameters?.id;

    // Route: GET /adoption
    if (resource === "/adoption" && httpMethod === "GET") {
      // Build query conditions
      let queryConditions = {};
      const handleMultipleValues = (paramValue) => {
        if (!paramValue) return [];
        return Array.isArray(paramValue) ? paramValue : paramValue.split(",");
      };

      queryConditions.$and = [
        { AdoptionSite: { $nin: ["Arc Dog Shelter", "Tolobunny", "HKRABBIT"] } },
        { Image_URL: { $ne: [] } },
      ];

      // Handle query parameters
      if (event.queryStringParameters?.animal_type) {
        const animalTypes = handleMultipleValues(event.queryStringParameters.animal_type);
        if (animalTypes.length > 0) {
          queryConditions.Animal_Type = { $in: animalTypes };
        }
      }

      if (event.queryStringParameters?.location) {
        const locations = handleMultipleValues(event.queryStringParameters.location);
        if (locations.length > 0) {
          queryConditions.$and.push({ AdoptionSite: { $in: locations } });
        }
      }

      if (event.queryStringParameters?.sex) {
        const sexes = handleMultipleValues(event.queryStringParameters.sex);
        if (sexes.length > 0) {
          queryConditions.Sex = { $in: sexes };
        }
      }

      if (event.queryStringParameters?.age) {
        const ages = handleMultipleValues(event.queryStringParameters.age);
        const ageArray = [];
        if (ages.includes("幼年")) {
          ageArray.push({ Age: { $lt: 12 } });
        }
        if (ages.includes("青年")) {
          ageArray.push({ Age: { $lte: 36, $gte: 12 } });
        }
        if (ages.includes("成年")) {
          ageArray.push({ Age: { $lte: 12 * 6, $gte: 12 * 4 } });
        }
        if (ages.includes("老年")) {
          ageArray.push({ Age: { $gt: 12 * 7 } });
        }
        if (ageArray.length > 0) {
          queryConditions.$and = [{ $or: ageArray }];
        }
      }

      if (event.queryStringParameters?.search) {
        const search = event.queryStringParameters.search;
        queryConditions.$or = [
          { Breed: { $regex: search, $options: "i" } },
          { Animal_Type: { $regex: search, $options: "i" } },
          { Remark: { $regex: search, $options: "i" } },
        ];
      }

      // Calculate pagination
      const numberOfCollection = await Adoption.countDocuments(queryConditions);
      const maxPage = Math.ceil(numberOfCollection / 16);
      const limit = 16;
      const page = parseInt(event.queryStringParameters?.page) || 1;

      // Fetch adoption list
      const adoptionList = await Adoption.aggregate([
        {
          $addFields: {
            parsedDate: { $toDate: "$Creation_Date" },
          },
        },
        { $sort: { Creation_Date: -1 } },
        { $match: queryConditions },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);

      console.log("adoptionList:", adoptionList);

      return {
        statusCode: 200,
        body: JSON.stringify({
          adoptionList,
          maxPage,
          totalResult: numberOfCollection,
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Route: GET /adoption/{id}
    if (resource === "/adoption/{id}" && httpMethod === "GET") {
      if (!id) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Pet ID is required" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      console.log("req.params.id:", id);
      const adoptionPet = await Adoption.findOne({ _id: id });
      console.log("ADOPTION PET:", adoptionPet);

      if (!adoptionPet) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Pet not found" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ pet: adoptionPet }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Route: POST /adoption/{id}
    if (resource === "/adoption/{id}" && httpMethod === "POST") {
      if (!id) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Pet ID is required" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      const adoptionRecord = await AdoptionRecord.create({ petId: id });

      return {
        statusCode: 201,
        body: JSON.stringify({ record: adoptionRecord }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Invalid route or method
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid route or HTTP method" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};