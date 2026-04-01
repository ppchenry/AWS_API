const mongoose = require("mongoose");
const PetSchema = require("./models/pet");
const UserSchema = require("./models/User.js");
const PetSourceSchema = require("./models/pet_sources.js");
const petAdoptionSchema = require("./models/pet_adoptions.js");
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
    mongoose.model("User", UserSchema, "users");
    mongoose.model("pet_sources", PetSourceSchema,);
    mongoose.model("pet_adoptions", petAdoptionSchema,);
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

const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  // Basic phone validation - allows +, digits, spaces, hyphens, parentheses
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone);
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
        t
      );
    }

    const httpMethod = event.httpMethod;
    // Extract petID from the path parameters
    const petID = event.pathParameters?.petID;
    console.log("petID:", petID);

    const lang =
      event.cookies?.language || "zh";
    const t = loadTranslations(lang);

    if (!petID) {
      return createErrorResponse(
        400,
        "missingPetId",
        t
      );
    }

    // Validate petID format
    if (!isValidObjectId(petID)) {
      return createErrorResponse(
        400,
        "invalidPetIdFormat",
        t
      );
    }

    // Get the Pet model from the appropriate connection
    const Pet = readConn.model("Pet");

    // Find the pet by ID
    const pet = await Pet.findOne({ _id: petID });

    if (!pet) {
      return createErrorResponse(
        404,
        "petNotFound",
        t
      );
    }

    // Check if pet is deleted
    if (pet.deleted === true) {
      return createErrorResponse(
        410,
        "petDeleted",
        t
      );
    }

    // Check for /transfer path
    const isTransferPath = event.resource?.includes("/transfer") || event.path?.includes("/transfer");
    const isTransferNGOPath = event.resource?.includes("/NGOtransfer") || event.path?.includes("/NGOtransfer");
    const isSourcePath = event.resource?.includes("/source") || event.path?.includes("/source");
    const isPetAdoptionPath = event.resource?.includes("/pet-adoption") || event.path?.includes("/pet-adoption");
    console.log("isTransferPath:", isTransferPath);

    if (isTransferPath) {
      switch (httpMethod) {
        case "POST":
          // Use parsed body
          const updateBody = parsedBody;
          console.log("Request body:", updateBody);

          // Validate date format if provided
          if (updateBody.regDate && !isValidDateFormat(updateBody.regDate)) {
            return createErrorResponse(
              400,
              "transferPath.invalidDateFormat",
              t
            );
          }

          // Validate phone number format if provided
          if (updateBody.transferContact && !isValidPhoneNumber(updateBody.transferContact)) {
            return createErrorResponse(
              400,
              "transferPath.invalidPhoneFormat",
              t
            );
          }

          const TransferRecordId = new mongoose.Types.ObjectId();

          // Construct the transfer record
          const NewTransferRecord = {
            _id: TransferRecordId,
            regDate: updateBody.regDate ? parseDDMMYYYY(updateBody.regDate) : null,
            regPlace: updateBody.regPlace,
            transferOwner: updateBody.transferOwner,
            transferContact: updateBody.transferContact,
            transferRemark: updateBody.transferRemark || "",
          };

          // Connect to primary database for writes
          await connectToMongoDB();
          const PetModelPost = mongoose.model("Pet");
          
          await PetModelPost.updateOne(
            { _id: petID },
            { $push: { transfer: NewTransferRecord } }
          );


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "transferPath.postSuccess"),
              form: NewTransferRecord,
              petId: pet._id,
              transferId: TransferRecordId,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };

        case "PUT":
          const transferId = event.pathParameters?.transferId;
          console.log("transferId:", transferId);
          // Use parsed body
          const updateTransfer = parsedBody;
          console.log("Request body:", updateTransfer);

          if (!transferId) {
            return createErrorResponse(
              400,
              "transferPath.putMissingTransferId",
              t
            );
          }

          // Validate transferId format
          if (!isValidObjectId(transferId)) {
            return createErrorResponse(
              400,
              "transferPath.invalidTransferIdFormat",
              t
            );
          }

          // Check if transfer record exists
          const transferExists = pet.transfer && pet.transfer.some(t => t._id.toString() === transferId);
          if (!transferExists) {
            return createErrorResponse(
              404,
              "transferPath.transferNotFound",
              t
            );
          }

          // Validate date format if provided
          if (updateTransfer.regDate && !isValidDateFormat(updateTransfer.regDate)) {
            return createErrorResponse(
              400,
              "transferPath.invalidDateFormat",
              t
            );
          }

          // Validate phone number format if provided
          if (updateTransfer.transferContact && !isValidPhoneNumber(updateTransfer.transferContact)) {
            return createErrorResponse(
              400,
              "transferPath.invalidPhoneFormat",
              t
            );
          }

          // Prepare update object for specific transfer fields
          const updateFields = {};
          if (updateTransfer.regDate) updateFields["transfer.$.regDate"] = parseDDMMYYYY(updateTransfer.regDate);
          if (updateTransfer.regPlace) updateFields["transfer.$.regPlace"] = updateTransfer.regPlace;
          if (updateTransfer.transferOwner) updateFields["transfer.$.transferOwner"] = updateTransfer.transferOwner;
          if (updateTransfer.transferContact) updateFields["transfer.$.transferContact"] = updateTransfer.transferContact;
          if (updateTransfer.transferRemark !== undefined) updateFields["transfer.$.transferRemark"] = updateTransfer.transferRemark;

          // Connect to primary database for writes
          await connectToMongoDB();
          const PetModelPut = mongoose.model("Pet");
          
          // Update the specific transfer record in primary database
          await PetModelPut.updateOne(
            { _id: petID, "transfer._id": transferId },
            { $set: updateFields }
          );


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "transferPath.putSuccess"),
              form: updateTransfer,
              petId: pet._id,
              transferId: transferId,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };

        case "DELETE":
          const transferIdtoDelete = event.pathParameters?.transferId;

          if (!transferIdtoDelete) {
            return createErrorResponse(
              400,
              "transferPath.deleteMissingTransferId",
              t
            );
          }

          // Validate transferId format
          if (!isValidObjectId(transferIdtoDelete)) {
            return createErrorResponse(
              400,
              "transferPath.invalidTransferIdFormat",
              t
            );
          }

          // Check if transfer record exists
          const transferToDeleteExists = pet.transfer && pet.transfer.some(t => t._id.toString() === transferIdtoDelete);
          if (!transferToDeleteExists) {
            return createErrorResponse(
              404,
              "transferPath.transferNotFound",
              t
            );
          }

          // Connect to primary database for writes
          await connectToMongoDB();
          const PetModelDelete = mongoose.model("Pet");
          
          await PetModelDelete.updateOne(
            { _id: petID },
            { $pull: { transfer: { _id: transferIdtoDelete } } }
          );


          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "transferPath.deleteSuccess"),
              petId: pet._id,
              transferId: transferIdtoDelete,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };

        default:
          return createErrorResponse(
            405,
            "methodNotAllowed",
            t
          );
      }
    }
    else if (isTransferNGOPath) {
      // Use parsed body
      const updateTransfer = parsedBody;
      const updateFields = {};

      // Validate required fields
      if (!updateTransfer.UserEmail || !updateTransfer.UserContact) {
        return createErrorResponse(
          400,
          "ngoTransfer.missingRequiredFields",
          t
        );
      }

      // Validate email format
      if (updateTransfer.UserEmail && !isValidEmail(updateTransfer.UserEmail)) {
        return createErrorResponse(
          400,
          "ngoTransfer.invalidEmailFormat",
          t
        );
      }

      // Validate phone number format
      if (updateTransfer.UserContact && !isValidPhoneNumber(updateTransfer.UserContact)) {
        return createErrorResponse(
          400,
          "ngoTransfer.invalidPhoneFormat",
          t
        );
      }

      // Validate date format if provided
      if (updateTransfer.regDate && !isValidDateFormat(updateTransfer.regDate)) {
        return createErrorResponse(
          400,
          "ngoTransfer.invalidDateFormat",
          t
        );
      }

      if (updateTransfer.regDate) {
        updateFields['transferNGO.0.regDate'] = parseDDMMYYYY(updateTransfer.regDate);
      }
      if (updateTransfer.regPlace) {
        updateFields['transferNGO.0.regPlace'] = updateTransfer.regPlace;
      }
      if (updateTransfer.transferOwner) {
        updateFields['transferNGO.0.transferOwner'] = updateTransfer.transferOwner;
      }
      if (updateTransfer.transferContact) {
        updateFields['transferNGO.0.transferContact'] = updateTransfer.transferContact;
      }
      if (updateTransfer.UserContact) {
        updateFields['transferNGO.0.UserContact'] = updateTransfer.UserContact;
      }
      if (updateTransfer.UserEmail !== undefined) {
        updateFields['transferNGO.0.UserEmail'] = updateTransfer.UserEmail;
      }
      if (updateTransfer.transferRemark !== undefined) {
        updateFields['transferNGO.0.transferRemark'] = updateTransfer.transferRemark;
      }
      if (updateTransfer.isTransferred !== undefined) {
        updateFields['transferNGO.0.isTransferred'] = updateTransfer.isTransferred;
      }
      


      

      // Connect to primary database for writes
      await connectToMongoDB();
      const PetModelNGO = mongoose.model("Pet");
      const UserModelNGO = mongoose.model("User");
      
      // Re-check user in primary database for consistency
      const UserEmailCheckPrimary = await UserModelNGO.findOne({ email: updateTransfer.UserEmail });
      const UserContactCheckPrimary = await UserModelNGO.findOne({ phoneNumber: updateTransfer.UserContact });
      
      if (!UserEmailCheckPrimary || !UserContactCheckPrimary) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: "User not found in primary database",
            email: !UserEmailCheckPrimary,
            phoneNumber: !UserContactCheckPrimary,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      if (UserEmailCheckPrimary && UserContactCheckPrimary) {
        updateFields['userId'] = UserEmailCheckPrimary._id;
        updateFields['transfer.0.regDate'] = parseDDMMYYYY(updateTransfer.regDate);
        updateFields['transfer.0.regPlace'] = updateTransfer.regPlace;
        updateFields['transfer.0.transferOwner'] = updateTransfer.transferOwner;
        updateFields['transfer.0.transferContact'] = updateTransfer.transferContact;
        updateFields['transfer.0.transferRemark'] = updateTransfer.transferRemark;
        updateFields['ngoId'] = "";
      }

      await PetModelNGO.updateOne(
        { _id: petID },               
        { $set: updateFields }        
      );


      // Return the successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: getTranslation(t, "transferPath.putSuccess"),
          form: updateTransfer,
          petId: pet._id,
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    else if (isSourcePath) {  
      const SourceModel = readConn.model("pet_sources");
      
      switch (event.httpMethod) {
        // ────────────────────────────────────────────────
        // GET → Retrieve the rescue/origin info for this pet
        // ────────────────────────────────────────────────
        case "GET": {
          const record = await SourceModel.findOne({ petId: petID }).lean();
    
          if (!record) {
            return {
              statusCode: 200,  // or 404 — depends on your API style
              body: JSON.stringify({
                message: getTranslation(t, "petSource.getNotFound"),
                form: null,
                petId: petID,
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }
    
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "petSource.getSuccess") ,
              form: {
                _id: record._id,
                placeofOrigin: record.placeofOrigin,
                channel: record.channel,
                rescueCategory: record.rescueCategory,
                causeOfInjury: record.causeOfInjury,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
              },
              petId: petID,
              sourceId: record._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }
    
        // ────────────────────────────────────────────────
        // POST → Create new rescue/origin record for the pet
        // ────────────────────────────────────────────────
        case "POST": {
          let input;
          try {
            input = JSON.parse(event.body || '{}');
          } catch {
            return createErrorResponse(400, "common.invalidJSON", t);
          }
    
          // Optional: validate required fields
          if (!input.placeofOrigin && !input.channel) {
            return createErrorResponse(400, "petSource.missingRequiredFields", t);
          }
    
          // You can add date validation if you decide to add a date field later
    
          const newRecord = await SourceModel.create({
            petId: petID,
            placeofOrigin: input.placeofOrigin || null,
            channel: input.channel || null,
            rescueCategory: input.rescueCategory || null,
            causeOfInjury: input.causeOfInjury || null,
          });
    
    
          return {
            statusCode: 201,  // 201 Created is more appropriate for POST
            body: JSON.stringify({
              message: getTranslation(t, "petSource.postSuccess"),
              form: input,
              petId: petID,
              sourceId: newRecord._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }
    
        // ────────────────────────────────────────────────
        // PUT → Update existing rescue/origin record
        // ────────────────────────────────────────────────
        case "PUT": {
          const sourceId = event.pathParameters?.sourceId;
    
          if (!sourceId) {
            return createErrorResponse(400, "petSource.putMissingSourceId", t);
          }
    
          if (!mongoose.isValidObjectId(sourceId)) {
            return createErrorResponse(400, "petSource.invalidSourceIdFormat", t);
          }
    
          const exists = await SourceModel.findById(sourceId);
          if (!exists || exists.petId.toString() !== petID.toString()) {
            return createErrorResponse(404, "petSource.recordNotFound", t);
          }
    
          let input;
          try {
            input = JSON.parse(event.body || '{}');
          } catch {
            return createErrorResponse(400, "common.invalidJSON", t);
          }
    
          const updateFields = {};
          if (input.placeofOrigin !== undefined)      updateFields.placeofOrigin      = input.placeofOrigin;
          if (input.channel !== undefined)            updateFields.channel            = input.channel;
          if (input.rescueCategory !== undefined)    updateFields.rescueCategory    = input.rescueCategory;
          if (input.causeOfInjury !== undefined)      updateFields.causeOfInjury      = input.causeOfInjury;
    
          if (Object.keys(updateFields).length === 0) {
            return createErrorResponse(400, "petSource.noFieldsToUpdate", t);
          }
    
          await SourceModel.updateOne(
            { _id: sourceId },
            { $set: updateFields }
          );
    
    
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "petSource.putSuccess"),
              petId: petID,
              sourceId: sourceId,
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
    }
    else if (isPetAdoptionPath) {
      const AdoptionRead = readConn.model("pet_adoptions");
    
      switch (event.httpMethod) {
        // ────────────────────────────────────────────────
        // GET - Retrieve post-adoption record for the pet
        // ────────────────────────────────────────────────
        case "GET": {
          const record = await AdoptionRead.findOne({ petId: petID }).lean();
    
          if (!record) {
            return {
              statusCode: 200, // or 404 depending on your preference
              body: JSON.stringify({
                message: getTranslation(t, "petAdoption.getNotFound"),
                form: null,
                petId: petID,
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }
    
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "petAdoption.getSuccess"),
              form: {
                _id: record._id,
                postAdoptionName: record.postAdoptionName,
                isNeutered: record.isNeutered,
                NeuteredDate: record.NeuteredDate,
                firstVaccinationDate: record.firstVaccinationDate,
                secondVaccinationDate: record.secondVaccinationDate,
                thirdVaccinationDate: record.thirdVaccinationDate,
                followUpMonth1: record.followUpMonth1,
                followUpMonth2: record.followUpMonth2,
                followUpMonth3: record.followUpMonth3,
                followUpMonth4: record.followUpMonth4,
                followUpMonth5: record.followUpMonth5,
                followUpMonth6: record.followUpMonth6,
                followUpMonth7: record.followUpMonth7,
                followUpMonth8: record.followUpMonth8,
                followUpMonth9: record.followUpMonth9,
                followUpMonth10: record.followUpMonth10,
                followUpMonth11: record.followUpMonth11,
                followUpMonth12: record.followUpMonth12,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
              },
              petId: petID,
              adoptionId: record._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }
    
        // ────────────────────────────────────────────────
        // POST - Create new post-adoption record
        // ────────────────────────────────────────────────
        case "POST": {
          let input;
          try {
            input = JSON.parse(event.body || '{}');
          } catch {
            return createErrorResponse(400, "common.invalidJSON", t);
          }
    
          // Optional: basic validation
          if (input.NeuteredDate && !isValidDateFormat(input.NeuteredDate)) {
            return createErrorResponse(400, "petAdoption.invalidDateFormat", t);
          }
          // You can add similar checks for vaccination dates if needed
    
          await connectToMongoDB();
          const AdoptionWrite = mongoose.model("pet_adoptions");
    
          const newRecord = await AdoptionWrite.create({
            petId: petID,
            postAdoptionName: input.postAdoptionName || null,
            isNeutered: input.isNeutered ?? null,
            NeuteredDate: input.NeuteredDate ? parseDDMMYYYY(input.NeuteredDate) : null,
            firstVaccinationDate: input.firstVaccinationDate ? parseDDMMYYYY(input.firstVaccinationDate) : null,
            secondVaccinationDate: input.secondVaccinationDate ? parseDDMMYYYY(input.secondVaccinationDate) : null,
            thirdVaccinationDate: input.thirdVaccinationDate ? parseDDMMYYYY(input.thirdVaccinationDate) : null,
            followUpMonth1: input.followUpMonth1 ?? false,
            followUpMonth2: input.followUpMonth2 ?? false,
            followUpMonth3: input.followUpMonth3 ?? false,
            followUpMonth4: input.followUpMonth4 ?? false,
            followUpMonth5: input.followUpMonth5 ?? false,
            followUpMonth6: input.followUpMonth6 ?? false,
            followUpMonth7: input.followUpMonth7 ?? false,
            followUpMonth8: input.followUpMonth8 ?? false,
            followUpMonth9: input.followUpMonth9 ?? false,
            followUpMonth10: input.followUpMonth10 ?? false,
            followUpMonth11: input.followUpMonth11 ?? false,
            followUpMonth12: input.followUpMonth12 ?? false,
          });
    
    
          return {
            statusCode: 201,
            body: JSON.stringify({
              message: getTranslation(t, "petAdoption.postSuccess"),
              form: input,
              petId: petID,
              adoptionId: newRecord._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }
    
        // ────────────────────────────────────────────────
        // PUT - Update existing post-adoption record
        // ────────────────────────────────────────────────
        case "PUT": {
          const adoptionId = event.pathParameters?.adoptionId;
    
          if (!adoptionId) {
            return createErrorResponse(400, "petAdoption.putMissingAdoptionId", t);
          }
    
          if (!mongoose.isValidObjectId(adoptionId)) {
            return createErrorResponse(400, "petAdoption.invalidAdoptionIdFormat", t);
          }
    
          const exists = await AdoptionRead.findById(adoptionId);
          if (!exists || exists.petId.toString() !== petID.toString()) {
            return createErrorResponse(404, "petAdoption.recordNotFound", t);
          }
    
          let input;
          try {
            input = JSON.parse(event.body || '{}');
          } catch {
            return createErrorResponse(400, "common.invalidJSON", t);
          }
    
          const updateFields = {};
    
          if (input.postAdoptionName !== undefined) updateFields.postAdoptionName = input.postAdoptionName;
          if (input.isNeutered !== undefined) updateFields.isNeutered = input.isNeutered;
          if (input.NeuteredDate !== undefined) {
            updateFields.NeuteredDate = input.NeuteredDate ? parseDDMMYYYY(input.NeuteredDate) : null;
          }
          if (input.firstVaccinationDate !== undefined) {
            updateFields.firstVaccinationDate = input.firstVaccinationDate ? parseDDMMYYYY(input.firstVaccinationDate) : null;
          }
          if (input.secondVaccinationDate !== undefined) {
            updateFields.secondVaccinationDate = input.secondVaccinationDate ? parseDDMMYYYY(input.secondVaccinationDate) : null;
          }
          if (input.thirdVaccinationDate !== undefined) {
            updateFields.thirdVaccinationDate = input.thirdVaccinationDate ? parseDDMMYYYY(input.thirdVaccinationDate) : null;
          }
    
          // Follow-up months (allow partial updates)
          for (let i = 1; i <= 12; i++) {
            const key = `followUpMonth${i}`;
            if (input[key] !== undefined) {
              updateFields[key] = !!input[key];
            }
          }
    
          if (Object.keys(updateFields).length === 0) {
            return createErrorResponse(400, "petAdoption.noFieldsToUpdate", t);
          }
    
          await connectToMongoDB();
          const AdoptionWrite = mongoose.model("pet_adoptions");
    
          await AdoptionWrite.updateOne(
            { _id: adoptionId },
            { $set: updateFields }
          );
    
    
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "petAdoption.putSuccess") || "Post-adoption record updated successfully",
              petId: petID,
              adoptionId: adoptionId,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }
    
        // ────────────────────────────────────────────────
        // DELETE - Remove the post-adoption record
        // ────────────────────────────────────────────────
        case "DELETE": {
          const adoptionId = event.pathParameters?.adoptionId;
    
          if (!adoptionId) {
            return createErrorResponse(400, "petAdoption.deleteMissingAdoptionId", t);
          }
    
          if (!mongoose.isValidObjectId(adoptionId)) {
            return createErrorResponse(400, "petAdoption.invalidAdoptionIdFormat", t);
          }
    
          await connectToMongoDB();
          const AdoptionWrite = mongoose.model("pet_adoptions");
    
          const deleted = await AdoptionWrite.deleteOne({ _id: adoptionId, petId: petID });
    
          if (deleted.deletedCount === 0) {
            return createErrorResponse(404, "petAdoption.recordNotFound", t);
          }
    
    
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "petAdoption.deleteSuccess") || "Post-adoption record deleted successfully",
              petId: petID,
              adoptionId: adoptionId,
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
    }
    else {
      switch (httpMethod) {
        case "GET":
          const form = {
            chipId: pet.chipId,
            placeOfBirth: pet.placeOfBirth,
            transfer: pet.transfer,
            transferNGO: pet.transferNGO,
            motherName: pet.motherName,
            motherBreed: pet.motherBreed,
            motherDOB: pet.motherDOB,
            motherChip: pet.motherChip,
            motherPlaceOfBirth: pet.motherPlaceOfBirth,
            motherParity: pet.motherParity,
            fatherName: pet.fatherName,
            fatherBreed: pet.fatherBreed,
            fatherDOB: pet.fatherDOB,
            fatherChip: pet.fatherChip,
            fatherPlaceOfBirth: pet.fatherPlaceOfBirth,
          };

          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "petDetailInfo.getDetailSuccess"),
              form: form,
              petId: pet._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "POST":
          // Use parsed body
          const updateBody = parsedBody;
          console.log("Request body:", updateBody);

          // Validate date formats if provided
          if (updateBody.motherDOB && !isValidDateFormat(updateBody.motherDOB)) {
            return createErrorResponse(
              400,
              "petDetailInfo.invalidDateFormat",
              t
            );
          }
          if (updateBody.fatherDOB && !isValidDateFormat(updateBody.fatherDOB)) {
            return createErrorResponse(
              400,
              "petDetailInfo.invalidDateFormat",
              t
            );
          }

          const updateFields = {};
          if (updateBody.chipId) updateFields.chipId = updateBody.chipId;
          if (updateBody.placeOfBirth) updateFields.placeOfBirth = updateBody.placeOfBirth;
          if (updateBody.motherName) updateFields.motherName = updateBody.motherName;
          if (updateBody.motherBreed) updateFields.motherBreed = updateBody.motherBreed;
          if (updateBody.motherDOB) updateFields.motherDOB = parseDDMMYYYY(updateBody.motherDOB);
          if (updateBody.motherChip) updateFields.motherChip = updateBody.motherChip;
          if (updateBody.motherPlaceOfBirth) updateFields.motherPlaceOfBirth = updateBody.motherPlaceOfBirth;
          if (updateBody.motherParity) updateFields.motherParity = updateBody.motherParity;
          if (updateBody.fatherName) updateFields.fatherName = updateBody.fatherName;
          if (updateBody.fatherBreed) updateFields.fatherBreed = updateBody.fatherBreed;
          if (updateBody.fatherDOB) updateFields.fatherDOB = parseDDMMYYYY(updateBody.fatherDOB);
          if (updateBody.fatherChip) updateFields.fatherChip = updateBody.fatherChip;
          if (updateBody.fatherPlaceOfBirth) updateFields.fatherPlaceOfBirth = updateBody.fatherPlaceOfBirth;

          // Connect to primary database for writes
          await connectToMongoDB();
          const PetModelDetail = mongoose.model("Pet");
          
          const result = await PetModelDetail.updateOne(
            { _id: petID },
            { $set: updateFields }
          );


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "petDetailInfo.postDetailSuccess"),
              form: updateFields,
              petId: pet._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };

        default:
          return createErrorResponse(
            405,
            "methodNotAllowed",
            t
          );
      }
    }
  } catch (error) {
    console.error("Error in pet detail info:", error);
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