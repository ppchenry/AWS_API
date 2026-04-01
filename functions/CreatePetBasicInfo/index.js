const mongoose = require("mongoose");
const multipart = require('aws-lambda-multipart-parser');

const PetSchema = require("./models/pet");
const UserSchema = require("./models/user");

const fs = require("fs");
const path = require("path");

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    mongoose.model("Pet", PetSchema);
    mongoose.model("User", UserSchema);
  }
  return conn;
};


const loadTranslations = (lang = "en") => {
  const supportedLangs = ["en", "zh"];
  const fallbackLang = "en";

  const filePath = path.join(
    __dirname,
    "locales",
    `${supportedLangs.includes(lang) ? lang : fallbackLang}.json`
  );
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
};


// Helper function to create error response
const createErrorResponse = (statusCode, error, translations, headers = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
    'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
    ...headers
  };
  
  const errorMessage = translations ? getTranslation(translations, error) : error;
  
  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify({
      error: errorMessage,
    })
  };
};

// Validation helper functions
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.isValidObjectId(id);
};

const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return false;
  // Check ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  if (dateString.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/)) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }
  // Check DD/MM/YYYY format
  if (dateString.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [day, month, year] = dateString.split("/");
    if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
      const date = new Date(year, month - 1, day);
      return date instanceof Date && !isNaN(date.getTime());
    }
  }
  return false;
};

const isValidImageUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

function parseDDMMYYYY(dateString) {
  if (!dateString) return null;

  // If it's already an ISO string, use it directly
  if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(dateString);
  }

  // Parse DD/MM/YYYY format
  const [day, month, year] = dateString.split("/");
  if (
    day &&
    month &&
    year &&
    day.length <= 2 &&
    month.length <= 2 &&
    year.length === 4
  ) {
    return new Date(year, month - 1, day);
  }

  // Fallback to original parsing
  return new Date(dateString);
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  

  try {
    // Connect to MongoDB
    await connectToMongoDB();
    console.log("EVENT BODY: ", event.body);
    
    // Load translations early for error handling
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);
    
    // Extract body from the event (API Gateway Lambda Proxy) with error handling
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, "invalidJSON", t);
    }
    
    // Update language from body if provided
    const finalLang = event.cookies?.language || body.lang?.toLowerCase() || "zh";
    const finalT = finalLang !== lang ? loadTranslations(finalLang) : t;
    // const body = await multipart.parse(event, false);
    console.log("Request body:", body);

    // Extract required fields
    const {
      userId,
      name,
      birthday,
      weight,
      sex,
      sterilization,
      animal,
      breed,
      features,
      info,
      status,
      owner,
      ngoId,
      ngoPetId,
      breedimage,
      ownerContact1,
      ownerContact2,
      contact1Show,
      contact2Show,
      tagId,
      receivedDate,
    } = body;

    // Validate required fields
    if (!userId) {
      return createErrorResponse(400, "missingUserId", finalT);
    }

    if (!name) {
      return createErrorResponse(400, "missingName", finalT);
    }

    if (!birthday) {
      return createErrorResponse(400, "missingBirthday", finalT);
    }

    if (!sex) {
      return createErrorResponse(400, "missingSex", finalT);
    }

    if (!animal) {
      return createErrorResponse(400, "missingAnimal", finalT);
    }

    // Validate userId format
    if (!isValidObjectId(userId)) {
      return createErrorResponse(400, "invalidUserIdFormat", finalT);
    }

    // Validate user exists (assuming User model is available)
    const User = mongoose.model("User"); // Adjust model import as needed
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return createErrorResponse(404, "userNotFound", finalT);
    }

    // Validate and parse dates
    if (birthday && !isValidDateFormat(birthday)) {
      return createErrorResponse(400, "invalidDateFormat", finalT);
    }
    if (receivedDate && !isValidDateFormat(receivedDate)) {
      return createErrorResponse(400, "invalidDateFormat", finalT);
    }
    
    const parsedBirthday = birthday ? parseDDMMYYYY(birthday) : null;
    const parsedReceivedDate = receivedDate ? parseDDMMYYYY(receivedDate) : null;
    
    // Validate weight format if provided
    if (weight !== undefined && weight !== null && (typeof weight !== 'number' || isNaN(weight))) {
      return createErrorResponse(400, "invalidWeightFormat", finalT);
    }
    
    // Validate boolean fields if provided
    if (sterilization !== undefined && sterilization !== null && typeof sterilization !== 'boolean') {
      return createErrorResponse(400, "invalidBooleanFormat", finalT);
    }
    if (contact1Show !== undefined && contact1Show !== null && typeof contact1Show !== 'boolean') {
      return createErrorResponse(400, "invalidBooleanFormat", finalT);
    }
    if (contact2Show !== undefined && contact2Show !== null && typeof contact2Show !== 'boolean') {
      return createErrorResponse(400, "invalidBooleanFormat", finalT);
    }
    
    // Validate breedimage format if provided
    if (breedimage !== undefined && breedimage !== null) {
      if (!Array.isArray(breedimage)) {
        return createErrorResponse(400, "invalidBreedimageFormat", finalT);
      }
      // Validate each image URL in the array
      for (const url of breedimage) {
        if (url && !isValidImageUrl(url)) {
          return createErrorResponse(400, "invalidImageUrlFormat", finalT);
        }
      }
    }

    // Prepare pet data object
    const petData = {
      userId,
      name,
      birthday: parsedBirthday,
      weight,
      sex,
      sterilization,
      animal,
      breed,
      features,
      info,
      status,
      owner,
      ngoId,
      ngoPetId,
      breedimage: breedimage || [],
      ownerContact1,
      ownerContact2,
      contact1Show,
      contact2Show,
      tagId,
      receivedDate: parsedReceivedDate,
      transferNGO: {regDate: "", regPlace: "", transferOwner: "", UserContact: "", UserEmail: "", transferContact: "", transferRemark: "", isTransferred: false},
    };

    // Check for duplicate ngoPetId in primary database
    if (ngoPetId != undefined) {
      const oldPet = await mongoose.model("Pet").findOne({ ngoPetId });
      if (oldPet) {
        return createErrorResponse(400, "duplicatePetNgoId", finalT);
      }
    }

    // Check for duplicate tagId in primary database
    if (tagId != undefined) {
      const oldTagId = await mongoose.model("Pet").findOne({ tagId });
      if (oldTagId) {
        return createErrorResponse(400, "duplicatePetTagId", finalT);
      }
    }


    // Create new pet document in primary database
    const Pet = mongoose.model("Pet");
    const pet = await Pet.create(petData);


    return {
      statusCode: 201,
      body: JSON.stringify({
        message: getTranslation(finalT, "success"),
        form: body,
        id: pet._id,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error creating pet basic info:", error);
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