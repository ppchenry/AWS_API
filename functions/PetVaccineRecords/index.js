const mongoose = require("mongoose");
const PetSchema = require("./models/pet");
const VaccineRecordsSchema = require("./models/vaccine_records")
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
    // Register the Pet schema
    mongoose.model("Pet", PetSchema);
    mongoose.model("Vaccine_Records", VaccineRecordsSchema);

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
  
  // Check ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/)) {
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

// Helper function to create error response
const createErrorResponse = (statusCode, error, translations, headers = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...headers
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
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Get connection for reads
    const readConn = await getReadConnection();

    // Load translations early for error handling
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);

    // Extract petID from the path parameters
    const petID = event.pathParameters?.petID;
    console.log("petID:", petID);

    if (!petID) {
      return createErrorResponse(400, "missingPetId", t);
    }

    // Validate petID format
    if (!isValidObjectId(petID)) {
      return createErrorResponse(400, "invalidPetIdFormat", t);
    }

    // Get the Pet model (using read connection)
    const PetRead = readConn.model("Pet");

    // Find the pet by ID (using read connection)
    const pet = await PetRead.findOne({ _id: petID });

    if (!pet) {
      return createErrorResponse(404, "petNotFound", t);
    }

    // Check if pet is deleted
    if (pet.deleted === true) {
      return createErrorResponse(410, "petDeleted", t);
    }
    const httpMethod = event.httpMethod;
    const VaccinationRecords = readConn.model("Vaccine_Records");
    const petVaccinationsRecords = await VaccinationRecords.find({petId: petID});
    switch (httpMethod) {
      case "GET": {
        // Construct the response form
        const form = {
          vaccineRecords: petVaccinationsRecords? petVaccinationsRecords.map((record) => ({
            vaccineDate: record.vaccineDate,
            vaccineName: record.vaccineName,
            vaccineNumber: record.vaccineNumber,
            vaccineTimes: record.vaccineTimes,
            vaccinePosition: record.vaccinePosition,
            _id: record._id,
          })) : [],
        };

        // Return the successful response
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: getTranslation(t, "vaccineRecord.getSuccess"),
            form: form,
            petId: petID,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
      case "POST": {
        // Parse JSON body with error handling
        let newVaccineRecord;
        try {
          newVaccineRecord = JSON.parse(event.body || '{}');
        } catch (parseError) {
          return createErrorResponse(400, "common.invalidJSON", t);
        }

        // Validate date format if provided
        if (newVaccineRecord.vaccineDate && !isValidDateFormat(newVaccineRecord.vaccineDate)) {
          return createErrorResponse(400, "vaccineRecord.invalidDateFormat", t);
        }

        // Construct the vaccine record
        const vaccineRecord = await VaccinationRecords.create({
          vaccineDate: newVaccineRecord.vaccineDate ? parseDDMMYYYY(newVaccineRecord.vaccineDate) : null,
          vaccineName: newVaccineRecord.vaccineName,
          vaccineNumber: newVaccineRecord.vaccineNumber,
          vaccineTimes: newVaccineRecord.vaccineTimes,
          vaccinePosition: newVaccineRecord.vaccinePosition,
          petId: petID
        });

        await PetRead.findByIdAndUpdate({_id: petID}, {
          $inc: { vaccineRecordsCount: 1 },
          $max: { latestVaccineDate: newVaccineRecord.vaccineDate || null }
        });



        // Return the successful response
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: getTranslation(t, "vaccineRecord.postSuccess"),
            form: newVaccineRecord,
            petId: petID,
            vaccineId: vaccineRecord._id,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
      case "PUT": {
        const VaccineIDtoUpdate = event.pathParameters?.vaccineID;

        if (!VaccineIDtoUpdate) {
          return createErrorResponse(400, "vaccineRecord.putMissingVaccineId", t);
        }

        // Validate vaccineID format
        if (!isValidObjectId(VaccineIDtoUpdate)) {
          return createErrorResponse(400, "vaccineRecord.invalidVaccineIdFormat", t);
        }

        // Check if vaccine record exists
        const vaccineExists = await VaccinationRecords.findOne({_id: VaccineIDtoUpdate});
        if (!vaccineExists) {
          return createErrorResponse(404, "vaccineRecord.vaccineRecordNotFound", t);
        }

        // Parse JSON body with error handling
        let updatedVaccineRecord;
        try {
          updatedVaccineRecord = JSON.parse(event.body || '{}');
        } catch (parseError) {
          return createErrorResponse(400, "common.invalidJSON", t);
        }

        // Validate date format if provided
        if (updatedVaccineRecord.vaccineDate && !isValidDateFormat(updatedVaccineRecord.vaccineDate)) {
          return createErrorResponse(400, "vaccineRecord.invalidDateFormat", t);
        }

        // Prepare update object for specific vaccine fields
        const updateFields = {};
        if (updatedVaccineRecord.vaccineDate) updateFields["vaccineDate"] = parseDDMMYYYY(updatedVaccineRecord.vaccineDate);
        if (updatedVaccineRecord.vaccineName) updateFields["vaccineName"] = updatedVaccineRecord.vaccineName;
        if (updatedVaccineRecord.vaccineNumber) updateFields["vaccineNumber"] = updatedVaccineRecord.vaccineNumber;
        if (updatedVaccineRecord.vaccineTimes) updateFields["vaccineTimes"] = updatedVaccineRecord.vaccineTimes;
        if (updatedVaccineRecord.vaccinePosition) updateFields["vaccinePosition"] = updatedVaccineRecord.vaccinePosition;
        
        // Update the specific vaccine record in primary database
        const result = await VaccinationRecords.updateOne(
          { _id: VaccineIDtoUpdate},
          { $set: updateFields }
        );

        const latest = await VaccinationRecords
        .find({ petId: petID })
        .sort({ vaccineDate: -1 })
        .limit(1)

        await PetRead.findByIdAndUpdate({_id: petID}, {
          latestVaccineDate: latest[0]?.vaccineDate || null
        });


        // Return the successful response
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: getTranslation(t, "vaccineRecord.putSuccess"),
            petId: petID,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
      case "DELETE": {
        const VaccineIDtoDelete = event.pathParameters?.vaccineID;
        if (!VaccineIDtoDelete) {
          return createErrorResponse(400, "vaccineRecord.putMissingVaccineId", t);
        }

        // Validate vaccineID format
        if (!isValidObjectId(VaccineIDtoDelete)) {
          return createErrorResponse(400, "vaccineRecord.invalidVaccineIdFormat", t);
        }

        // Check if vaccine record exists
        const vaccineToDeleteExists = await VaccinationRecords.findOne({_id: VaccineIDtoDelete});
        if (!vaccineToDeleteExists) {
          return createErrorResponse(404, "vaccineRecord.vaccineRecordNotFound", t);
        }

        await VaccinationRecords.deleteOne({_id: VaccineIDtoDelete});
        const latest = await VaccinationRecords
          .find({ petId: petID })
          .sort({ vaccineDate: -1 })
          .limit(1)

        await PetRead.findByIdAndUpdate({_id: petID}, {
          vaccineRecordsCount: await VaccinationRecords.countDocuments({ petId: petID }),
          latestVaccineDate: latest[0]?.vaccineDate || null
        })


        // Return the successful response
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: getTranslation(t, "vaccineRecord.deleteSuccess"),
            id: pet._id,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
      default:
        return createErrorResponse(405, "methodNotAllowed", t);
    }
  } catch (error) {
    console.error("Error fetching pet vaccine record:", error);
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false,
        error: "Internal Server Error" 
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};