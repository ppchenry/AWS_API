const mongoose = require("mongoose");
const PetSchema = require("./models/pet");
const fs = require("fs");
const path = require("path");
const { authJWT } = require('./authJWT');
const { corsHeaders, handleOptions } = require('./cors');


// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    // Register the Pet schema
    mongoose.model("Pet", PetSchema);
  }
  return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

// Load translations from JSON files
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

// Get translation for a given key
const getTranslation = (translations, key) => {
  return (
    key.split(".").reduce((obj, part) => {
      return obj && obj[part] !== undefined ? obj[part] : null;
    }, translations) || key
  );
};

// Validation helper functions
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.isValidObjectId(id);
};

const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
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

const escapeRegex = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Helper function to create error response
const createErrorResponse = (statusCode, error, translations, event) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...corsHeaders(event),
  };
  
  const errorMessage = translations ? getTranslation(translations, error) : error;
  
  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify({
      success: false,
      error: errorMessage,
    })
  };
};

exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Get connection for reads
    const readConn = await getReadConnection();

    // Parse JSON body with error handling
    let parsedBody;
    try {
      parsedBody = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
      const lang = event.cookies?.language || "zh";
      const t = loadTranslations(lang);
      return createErrorResponse(
        400,
        'common.invalidJSON',
        t,
        event
      );
    }

    const isngoPath = event.resource?.includes("/pet-list-ngo") || event.path?.includes("/pet-list-ngo");
    const isDeleteStatus = event.resource?.includes("/deletePet") || event.path?.includes("/deletePet");
    const isUpdatePetEye = event.resource?.includes("/updatePetEye") || event.path?.includes("/updatePetEye");

    if (isngoPath) {
      const ngoId = event.pathParameters?.ngoId;
      const queryParams = event.queryStringParameters || {};
      // Get page from query string, default to 1, ensure it's a number
      const pageNumber = Math.max(1, parseInt(queryParams.page || 1, 10));
      const limitNumber = 30;
      const search = typeof queryParams.search === "string" ? queryParams.search.trim() : "";
      const sortByAllowList = new Set(["updatedAt", "createdAt", "name", "animal", "breed", "birthday", "receivedDate", "ngoPetId"]);
      const sortBy = sortByAllowList.has(queryParams.sortBy) ? queryParams.sortBy : "updatedAt";
      const sortOrder = String(queryParams.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
      const query = { ngoId, deleted: false };

      if (search) {
        const safeSearch = escapeRegex(search);
        query.$or = [
          { name: { $regex: safeSearch, $options: "i" } },
          { animal: { $regex: safeSearch, $options: "i" } },
          { breed: { $regex: safeSearch, $options: "i" } },
          { ngoPetId: { $regex: safeSearch, $options: "i" } },
          { owner: { $regex: safeSearch, $options: "i" } },
        ];
      }
      
      const lang = event.cookies?.language || "zh";
      const t = loadTranslations(lang);

      if (!ngoId) {
        return createErrorResponse(400, "ngoPath.missingNgoId", t, event);
      }

      const Pet = readConn.model("Pet");

      // 1. Fetch Paginated Results
      // .lean() is critical here to handle 30 docs without hitting memory limits
      const pets = await Pet.find(query)
        .sort({ [sortBy]: sortOrder, _id: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(); 

      // 2. Fetch Total Count
      const totalNumber = await Pet.countDocuments(query);

      if (!pets || pets.length === 0) {
        return createErrorResponse(404, "ngoPath.noPetsFound", t, event);
      } else {
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(event)
          },
          body: JSON.stringify({
            message: getTranslation(t, "ngoPath.success"),
            pets,
            total: totalNumber,
            currentPage: pageNumber,
            perPage: limitNumber
          }),
        };
      }
    }
    else if (isDeleteStatus) {
      // Use parsed body
      const body = parsedBody;
      const petId = body.petId;
      const lang =
      event.cookies?.language || "zh";
      const t = loadTranslations(lang);
      console.log("petId:", petId);

      if (!petId) {
        return createErrorResponse(
          400,
          "deleteStatus.missingPetId",
          t,
          event
        );
      }

      // Validate petId format
      if (!isValidObjectId(petId)) {
        return createErrorResponse(
          400,
          "deleteStatus.invalidPetIdFormat",
          t,
          event
        );
      }

      // Get the Pet model from read connection
      const PetRead = readConn.model("Pet");
      
      // Check if pet exists (using read connection)
      const pet = await PetRead.findOne({ _id: petId });
      if (!pet) {
        return createErrorResponse(
          404,
          "deleteStatus.petNotFound",
          t,
          event
        );
      }

      // Check if pet is already deleted
      if (pet.deleted === true) {
        return createErrorResponse(
          409,
          "deleteStatus.petAlreadyDeleted",
          t,
          event
        );
      }

      // Connect to primary database for writes
      await connectToMongoDB();
      const PetModel = mongoose.model("Pet");
      
      await PetModel.updateOne(
        { _id: petId },
        { $set: { deleted: true } }
      );


      return {
        statusCode: 200,
        body: JSON.stringify({
          message: getTranslation(t, "deleteStatus.success"),
          petId,
        }),
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event)
        },
      };

    }
    else if (isUpdatePetEye) {
      console.log("IS UPDATE PET EYE");
      // Use parsed body
      const updatePetEyeForm = parsedBody;
      console.log("UPDATE PET EYE FORM: ", updatePetEyeForm);

      const lang = event.cookies?.language || "zh";
      const t = loadTranslations(lang);

      const { petId, date, leftEyeImage1PublicAccessUrl, rightEyeImage1PublicAccessUrl } = updatePetEyeForm;
      
      // Check required fields
      if (!petId || !date || !leftEyeImage1PublicAccessUrl || !rightEyeImage1PublicAccessUrl) {
        return createErrorResponse(
          400,
          "updatePetEye.missingRequiredFields",
          t,
          event
        );
      }

      // Validate petId format
      if (!isValidObjectId(petId)) {
        return createErrorResponse(
          400,
          "updatePetEye.invalidPetIdFormat",
          t,
          event
        );
      }

      // Validate date format
      if (!isValidDateFormat(date)) {
        return createErrorResponse(
          400,
          "updatePetEye.invalidDateFormat",
          t,
          event
        );
      }

      // Validate image URLs
      if (!isValidImageUrl(leftEyeImage1PublicAccessUrl)) {
        return createErrorResponse(
          400,
          "updatePetEye.invalidImageUrlFormat",
          t,
          event
        );
      }

      if (!isValidImageUrl(rightEyeImage1PublicAccessUrl)) {
        return createErrorResponse(
          400,
          "updatePetEye.invalidImageUrlFormat",
          t,
          event
        );
      }

      console.log("NO PET");
      // Get the Pet model from read connection
      const PetRead = readConn.model("Pet");
      console.log("AFTER MONGOOSE MODEL PET");
      // Find the pet by ID (using read connection)
      const pet = await PetRead.findOne({ _id: petId });
      console.log("FOUND PET: ", PetRead);

      if (!pet) {
        return createErrorResponse(
          404,
          "updatePetEye.petNotFound",
          t,
          event
        );
      }

      // Check if pet is deleted
      if (pet.deleted === true) {
        return createErrorResponse(
          410,
          "updatePetEye.petDeleted",
          t,
          event
        );
      }

      // Create new eye image entry
      const newInformation = {
        date: new Date(date),
        eyeimage_left1: leftEyeImage1PublicAccessUrl,
        eyeimage_right1: rightEyeImage1PublicAccessUrl,
      };

      // Connect to primary database for writes
      await connectToMongoDB();
      const PetModel = mongoose.model("Pet");
      
      // Get pet from primary database and update
      const primaryPet = await PetModel.findOne({ _id: petId });
      if (!primaryPet) {
        return createErrorResponse(
          404,
          "updatePetEye.petNotFound",
          t,
          event
        );
      }

      primaryPet.eyeimages.push(newInformation);
      await primaryPet.save();
      console.log("newPet:", primaryPet);


      // Return the successful response
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: getTranslation(t, "updatePetEye.success"),
          result: primaryPet,
        }),
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event)
        },
      };
    }
    else {
      const authError = authJWT(event);
      if (authError) {
        // Add CORS headers to auth error response
        return {
          ...authError,
          headers: {
            ...authError.headers,
            ...corsHeaders(event),
          },
        };
      }

      const userId = event.pathParameters?.userId;
      const pageNumber = event.queryStringParameters?.page || 1;
      console.log("PAGENUMBER: ", pageNumber);

      console.log("userId:", userId);

      const lang = event.cookies?.language || "zh";
      const t = loadTranslations(lang);

      if (!userId) {
        return createErrorResponse(
          400,
          "getPetsByUser.missingUserId",
          t,
          event
        );
      }

      // Validate userId format
      if (!isValidObjectId(userId)) {
        return createErrorResponse(
          400,
          "getPetsByUser.invalidUserIdFormat",
          t,
          event
        );
      }

      // Get the Pet model from read connection
      const Pet = readConn.model("Pet");

      // Find all pets for the given userId (using read connection)
      const pets = await Pet
      .find({ userId, deleted: false })
      .sort({'updatedAt': -1})
      .skip((pageNumber - 1) * 10)
      .limit(10);

      const totalNumber = await Pet.countDocuments({ userId, deleted: false });
      console.log("totalNumber: ", totalNumber);

      // Return the successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: getTranslation(t, "getPetsByUser.success"),
          form: pets,
          total: totalNumber
        }),
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(event)
        },
      };
    }
  } catch (error) {
    console.error("Error fetching pets:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(event)
      },
    };
  }
};