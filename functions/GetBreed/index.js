const mongoose = require("mongoose");
const AnimalSchema = require("./models/AnimalList.js");
const ProductListSchema = require("./models/ProductList.js");
const DewormListSchema = require("./models/DewormList.js");
const EyeDiseaseListSchema = require("./models/Eye_disease.js");
const ProductLogSchema = require("./models/ProductLog.js");

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    // Register schema
    mongoose.model("Animal", AnimalSchema, "animal_list");
    mongoose.model("ProductList", ProductListSchema, "product");
    mongoose.model("Anthelmintic", DewormListSchema, "anthelmintic");
    mongoose.model("EyeDiseaseList", EyeDiseaseListSchema, "eye_disease");
    mongoose.model("ProductLog", ProductLogSchema, "product_log");
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
    
    console.log("EVENT.RESOURCE: ", event.resource);
    console.log("EVENT.PATH: ", event.path);
    console.log("EVENT: ", event);

    const isAnimalList = event.resource?.includes("/animalList") || event.path?.includes("/animalList");
    const isProductList = event.resource?.includes("/product/productList") || event.path?.includes("/product/productList");
    const createProductLog = event.resource?.includes("/product/productLog") || event.path?.includes("/product/productLog");
    const isDewormList = event.resource?.includes("/deworm") || event.path?.includes("/deworm");
    const isEyeAnalysis = event.resource?.includes("/analysis") || event.path?.includes("/analysis");

    if (isAnimalList) {
      const lang = event.pathParameters?.lang;

      if (!lang) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Language parameter is required" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Get the Animal model from the appropriate connection
      const Animal = readConn.model("Animal");

      // Find the animal list
      const animalList = await Animal.find({});

      if (!animalList || animalList.length === 0 || !animalList[0].animals[lang]) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Animal list not found for the specified language" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Return the successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          result: animalList[0].animals[lang],
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    else if (isProductList) {
      // Get the ProductList model from the appropriate connection
      const ProductList = readConn.model("ProductList");

      // Find all products
      const productList = await ProductList.find({});

      // Return the successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          result: productList,
          message: "Retrieve product list successfully!",
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    else if (isDewormList) {
      // Get the DewormList model from the appropriate connection
      const DewormList = readConn.model("Anthelmintic");

      // Find all deworm records
      const dewormList = await DewormList.find({});

      // Return the successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          result: dewormList,
          message: "Deworm list has successfully been retrieved",
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    else if (isEyeAnalysis) {
      let trimEyeDiseaseName;
      const eyeDiseaseName = event.pathParameters?.eyeDiseaseName;
      console.log("eyeDiseaseName:", eyeDiseaseName);
      
      if (!eyeDiseaseName) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "eyeDiseaseName parameter is required" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      if (eyeDiseaseName.includes("%20")) {
        console.log("this is true");
        trimEyeDiseaseName = decodeURIComponent(eyeDiseaseName);
      } else {
        trimEyeDiseaseName = eyeDiseaseName
      }
      console.log("new eyeDiseaseName:", eyeDiseaseName);


      // Get the EyeDiseaseList model from the appropriate connection
      const EyeDiseaseList = readConn.model("EyeDiseaseList");

      // Find the eye disease by name
      const eyeDiseaseDetails = await EyeDiseaseList.findOne({ eyeDisease_eng: trimEyeDiseaseName });

      let results;
      if (!eyeDiseaseDetails && eyeDiseaseName === "Normal") {
        results = {
          id: null,
          eyeDiseaseEng: null,
          eyeDiseaseChi: null,
          eyeDiseaseCause: null,
          eyeDiseaseSolution: null,
        };
      } else if (eyeDiseaseDetails) {
        results = eyeDiseaseDetails;
      } else {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Eye disease not found" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Return the successful response
      return {
        statusCode: 201,
        body: JSON.stringify({
          result: results,
          message: "Retrieve eye disease detail successfully",
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    else if (createProductLog) {
      try {
        // Connect to primary database for writes
        await connectToMongoDB();
        const ProductLog = mongoose.model("ProductLog");
        console.log('START CREATE PRODUCT LOG FUNCTION');
        const form = JSON.parse(event.body || '{}');
        const date = new Date(form.accessAt) ?? null;
        
        const productLogData = {
          petId: form.petId,
          userId: form.userId,
          userEmail: form.userEmail,
          productUrl: form.productUrl,
          accessAt: date,
        };
        
        // Create product log in primary database
        const newProductLog = await ProductLog.create(productLogData);


        return {
          statusCode: 201,
          body: JSON.stringify({
            message: "Successfully create product log",
            result: newProductLog
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (e) {
        console.error("Error creating product log:", e);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: e.message }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    }  
    else {
      console.log("TESTING")
      const animalType = event.pathParameters?.animalType;
      const lang = event.pathParameters?.lang;

      if (!animalType || !lang) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "animalType and lang parameters are required" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Get the Animal model from the appropriate connection
      const Animal = readConn.model("Animal");

      // Find the breed list
      const animalList = await Animal.find({});

      if (!animalList || animalList.length === 0 || !animalList[0].breeds[animalType] || !animalList[0].breeds[animalType][lang]) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Breed list not found for the specified animal type and language" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Return the successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          result: animalList[0].breeds[animalType][lang],
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
  } catch (error) {
    console.error("Error retrieving breed list:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};