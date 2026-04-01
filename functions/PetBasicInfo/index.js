const mongoose = require("mongoose");
const { authJWT } = require('./src/middleware/authJWT');
const { corsHeaders, handleOptions } = require('./src/cors');
const { connectToMongoDB, getReadConnection } = require('./src/config/db');
const { loadTranslations, getTranslation } = require('./src/utils/i18n');
const { createErrorResponse } = require('./src/utils/response');
const { isValidObjectId, isValidDateFormat, isValidImageUrl, isValidNumber, isValidBoolean } = require('./src/utils/validators');
const { parseDDMMYYYY } = require('./src/utils/dateParser');

exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  // Extract language from event (cookies, query params, or default to zh)
  const lang = event.cookies?.language || event.queryStringParameters?.lang?.toLowerCase() || "zh";
  const translations = loadTranslations(lang);

  try {
    // Get connection for reads
    const readConn = await getReadConnection();

    // Parse JSON body with error handling
    let parsedBody;
    try {
      parsedBody = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
      return createErrorResponse(
        400,
        "petBasicInfo.errors.invalidJSON",
        translations,
        event
      );
    }

    const petID = event.pathParameters?.petID;
    console.log("petID:", petID);

    if (!petID) {
      return createErrorResponse(
        400,
        "petBasicInfo.errors.petIdRequired",
        translations,
        event
      );
    }

    // Validate petID format
    if (!isValidObjectId(petID)) {
      return createErrorResponse(
        400,
        "petBasicInfo.errors.invalidPetIdFormat",
        translations,
        event
      );
    }

    // Get the Pet model from read connection
    const Pet = readConn.model("Pet");

    // Find the pet by ID (using read connection)
    const pet = await Pet.findOne({ _id: petID });

    if (!pet) {
      return createErrorResponse(
        404,
        "petBasicInfo.errors.petNotFound",
        translations,
        event
      );
    }

    // Check if pet is deleted
    if (pet.deleted === true) {
      return createErrorResponse(
        410,
        "petBasicInfo.errors.petDeleted",
        translations,
        event
      );
    }

    const isBasicInfo = event.resource?.includes("/basic-info") || event.path?.includes("/basic-info");
    const isEyeLog = event.resource?.includes("/eyeLog") || event.path?.includes("/eyeLog");
    if (isBasicInfo) {

      // const authError = authJWT(event);
      // if (authError) {
      //   // Add CORS headers to auth error response
      //   return {
      //     ...authError,
      //     headers: {
      //       ...authError.headers,
      //       ...corsHeaders(event),
      //     },
      //   };
      // }

    
      const httpMethod = event.httpMethod;
      switch (httpMethod) {
        case "GET":
          // Construct the response form
          const form = {
            userId: pet.userId,
            name: pet.name,
            breedimage: pet.breedimage,
            animal: pet.animal,
            birthday: pet.birthday,
            weight: pet.weight,
            sex: pet.sex,
            sterilization: pet.sterilization,
            sterilizationDate: pet.sterilizationDate,
            adoptionStatus: pet.adoptionStatus,
            breed: pet.breed,
            bloodType: pet.bloodType,
            features: pet.features,
            info: pet.info,
            status: pet.status,
            owner: pet.owner,
            ngoId: pet.ngoId,
            ownerContact1: pet.ownerContact1,
            ownerContact2: pet.ownerContact2,
            contact1Show: pet.contact1Show,
            contact2Show: pet.contact2Show,
            tagId: pet.tagId,
            isRegistered: pet.isRegistered,
            receivedDate: pet.receivedDate,
            ngoPetId: pet.ngoPetId,
            createdAt: pet.createdAt,
            updatedAt: pet.updatedAt,
            location: pet.locationName,
            position: pet.position
          };

          if (!form) {
            return createErrorResponse(
              404,
              "petBasicInfo.errors.petBasicInfoNotFound",
              translations,
              event
            );
          }

          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(translations, "petBasicInfo.success.retrievedSuccessfully"),
              form: form,
              id: pet._id,
            }),
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(event)
            },
          };
          break;
        case "PUT":
          // Use parsed body
          const UpdatedPetBasicInfo = parsedBody;
          
          // Validate that at least one field is provided for update
          const hasUpdateFields = Object.keys(UpdatedPetBasicInfo).length > 0;
          if (!hasUpdateFields) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.emptyUpdateBody",
              translations,
              event
            );
          }
          
          // Prepare update objects
          const setFields = {};

          // Validate date formats if provided
          if (UpdatedPetBasicInfo.birthday && !isValidDateFormat(UpdatedPetBasicInfo.birthday)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidBirthdayFormat",
              translations,
              event
            );
          }
          if (UpdatedPetBasicInfo.receivedDate && !isValidDateFormat(UpdatedPetBasicInfo.receivedDate)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidReceivedDateFormat",
              translations,
              event
            );
          }
          if (UpdatedPetBasicInfo.sterilizationDate && !isValidDateFormat(UpdatedPetBasicInfo.sterilizationDate)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidsterilizationDateFormat",
              translations,
              event
            );
          }
          
          // Validate type for weight
          if (UpdatedPetBasicInfo.weight !== undefined && !isValidNumber(UpdatedPetBasicInfo.weight)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidWeightType",
              translations,
              event
            );
          }
          
          // Validate type for ownerContact1
          if (UpdatedPetBasicInfo.ownerContact1 !== undefined && !isValidNumber(UpdatedPetBasicInfo.ownerContact1)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidOwnerContact1Type",
              translations,
              event
            );
          }
          
          // Validate type for ownerContact2
          if (UpdatedPetBasicInfo.ownerContact2 !== undefined && !isValidNumber(UpdatedPetBasicInfo.ownerContact2)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidOwnerContact2Type",
              translations,
              event
            );
          }
          
          // Validate type for boolean fields
          if (UpdatedPetBasicInfo.sterilization !== undefined && !isValidBoolean(UpdatedPetBasicInfo.sterilization)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidSterilizationType",
              translations,
              event
            );
          }
          if (UpdatedPetBasicInfo.contact1Show !== undefined && !isValidBoolean(UpdatedPetBasicInfo.contact1Show)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidContact1ShowType",
              translations,
              event
            );
          }
          if (UpdatedPetBasicInfo.contact2Show !== undefined && !isValidBoolean(UpdatedPetBasicInfo.contact2Show)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidContact2ShowType",
              translations,
              event
            );
          }
          if (UpdatedPetBasicInfo.isRegistered !== undefined && !isValidBoolean(UpdatedPetBasicInfo.isRegistered)) {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.invalidIsRegisteredType",
              translations,
              event
            );
          }

          // Validate image URLs if provided
          if (UpdatedPetBasicInfo.breedimage !== undefined) {
            const imageArray = Array.isArray(UpdatedPetBasicInfo.breedimage)
              ? UpdatedPetBasicInfo.breedimage
              : [UpdatedPetBasicInfo.breedimage];
            for (const url of imageArray) {
              if (url && !isValidImageUrl(url)) {
                return createErrorResponse(
                  400,
                  "petBasicInfo.errors.invalidImageUrl",
                  translations,
                  event
                );
              }
            }
            setFields.breedimage = imageArray;
          }

          // Fields to be updated with $set
          if (UpdatedPetBasicInfo.name) setFields.name = UpdatedPetBasicInfo.name;
          if (UpdatedPetBasicInfo.animal) setFields.animal = UpdatedPetBasicInfo.animal;
          if (UpdatedPetBasicInfo.birthday) setFields.birthday = parseDDMMYYYY(UpdatedPetBasicInfo.birthday);
          if (UpdatedPetBasicInfo.weight !== undefined) setFields.weight = UpdatedPetBasicInfo.weight;
          if (UpdatedPetBasicInfo.sex) setFields.sex = UpdatedPetBasicInfo.sex;
          if (UpdatedPetBasicInfo.sterilization !== undefined) setFields.sterilization = UpdatedPetBasicInfo.sterilization;
          if (UpdatedPetBasicInfo.sterilizationDate) setFields.sterilizationDate = parseDDMMYYYY(UpdatedPetBasicInfo.sterilizationDate);
          if (UpdatedPetBasicInfo.adoptionStatus) setFields.adoptionStatus = UpdatedPetBasicInfo.adoptionStatus;
          if (UpdatedPetBasicInfo.breed) setFields.breed = UpdatedPetBasicInfo.breed;
          if (UpdatedPetBasicInfo.bloodType) setFields.bloodType = UpdatedPetBasicInfo.bloodType;
          if (UpdatedPetBasicInfo.features) setFields.features = UpdatedPetBasicInfo.features;
          if (UpdatedPetBasicInfo.info) setFields.info = UpdatedPetBasicInfo.info;
          if (UpdatedPetBasicInfo.status) setFields.status = UpdatedPetBasicInfo.status;
          if (UpdatedPetBasicInfo.owner) setFields.owner = UpdatedPetBasicInfo.owner;
          if (UpdatedPetBasicInfo.ngoId) setFields.ngoId = UpdatedPetBasicInfo.ngoId;
          if (UpdatedPetBasicInfo.ownerContact1 !== undefined) setFields.ownerContact1 = UpdatedPetBasicInfo.ownerContact1;
          if (UpdatedPetBasicInfo.ownerContact2 !== undefined) setFields.ownerContact2 = UpdatedPetBasicInfo.ownerContact2;
          if (UpdatedPetBasicInfo.contact1Show !== undefined) setFields.contact1Show = UpdatedPetBasicInfo.contact1Show;
          if (UpdatedPetBasicInfo.contact2Show !== undefined) setFields.contact2Show = UpdatedPetBasicInfo.contact2Show;
          if (UpdatedPetBasicInfo.isRegistered !== undefined) setFields.isRegistered = UpdatedPetBasicInfo.isRegistered;
          if (UpdatedPetBasicInfo.receivedDate !== undefined) setFields.receivedDate = parseDDMMYYYY(UpdatedPetBasicInfo.receivedDate);
          if (UpdatedPetBasicInfo.location !== undefined) setFields.locationName = UpdatedPetBasicInfo.location;
          if (UpdatedPetBasicInfo.position !== undefined) setFields.position = UpdatedPetBasicInfo.position;
          
          // Check for duplicate tagId (using read connection)
          const CurrentTagId = pet.tagId;
          if (UpdatedPetBasicInfo.tagId !== undefined && UpdatedPetBasicInfo.tagId !== CurrentTagId) {
            try {
              const tagId = UpdatedPetBasicInfo.tagId;
              const oldTagId = await readConn.model("Pet").findOne({ tagId });
              if (oldTagId) {
                return createErrorResponse(
                  400,
                  "petBasicInfo.errors.duplicateTagId",
                  translations,
                  event
                );
              }
            } catch (error) {
              console.error("Error checking duplicate tagId:", error);
              return createErrorResponse(
                500,
                "petBasicInfo.errors.errorCheckingDuplicateTagId",
                translations,
                event
              );
            }
          }
          if (UpdatedPetBasicInfo.tagId !== undefined) {
            setFields.tagId = UpdatedPetBasicInfo.tagId;
          }

          const CurrentngoPetId = pet.ngoPetId;
          // if (UpdatedPetBasicInfo.ngoPetId !== undefined && UpdatedPetBasicInfo.ngoPetId !== CurrentngoPetId) {
          //   try {
          //     const ngoPetId = UpdatedPetBasicInfo.ngoPetId;
          //     const oldngoPetId = await readConn.model("Pet").findOne({ ngoPetId });
          //     if (oldngoPetId) {
          //       return createErrorResponse(
          //         400,
          //         "petBasicInfo.errors.duplicateNgoPetId",
          //         translations,
          //         event
          //       );
          //     }
          //   } catch (error) {
          //     console.error("Error checking duplicate ngoPetId:", error);
          //     return createErrorResponse(
          //       500,
          //       "petBasicInfo.errors.errorCheckingDuplicateNgoPetId",
          //       translations,
          //       event
          //     );
          //   }
          // }
          
          if (UpdatedPetBasicInfo.ngoPetId !== undefined) {
            setFields.ngoPetId = UpdatedPetBasicInfo.ngoPetId;
          }

          // Prepare the update operation
          const updateOperation = {};
          if (Object.keys(setFields).length > 0) updateOperation.$set = setFields;
          else {
            return createErrorResponse(
              400,
              "petBasicInfo.errors.noValidFieldsToUpdate",
              translations,
              event
            );
          }

          // Connect to primary database for writes
          await connectToMongoDB();
          const PetModel = mongoose.model("Pet");
          
          // Update the pet document in primary database
          try {
            await PetModel.findByIdAndUpdate(
              petID,
              updateOperation,
              { new: true, runValidators: true }
            );

          } catch (error) {
            console.error("Error updating pet:", error);
            // Handle Mongoose validation errors
            if (error.name === 'ValidationError') {
              const validationErrors = Object.values(error.errors).map(err => err.message).join(', ');
              const baseError = getTranslation(translations, "petBasicInfo.errors.validationError");
              return createErrorResponse(
                400,
                `${baseError}: ${validationErrors}`,
                translations,
                event
              );
            }
            // Handle CastError (invalid ObjectId, etc.)
            if (error.name === 'CastError') {
              const baseError = getTranslation(translations, "petBasicInfo.errors.invalidDataFormat");
              return createErrorResponse(
                400,
                `${baseError}: ${error.message}`,
                translations,
                event
              );
            }
            throw error; // Re-throw to be caught by outer catch
          }

          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(translations, "petBasicInfo.success.updatedSuccessfully"),
              id: pet._id,
            }),
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(event)

            },
          };

          break;
        default:
          return createErrorResponse(
            405,
            "petBasicInfo.errors.methodNotAllowed",
            translations,
            event
          );
      }
    }
    else if (isEyeLog) {
      // Validate HTTP method for EyeLog endpoint
      if (event.httpMethod !== "GET") {
        return createErrorResponse(
          405,
          "petBasicInfo.errors.methodNotAllowedEyeLog",
          translations,
          event
        );
      }
      
      // Validate connection and model
      if (!conn) {
        return createErrorResponse(
          500,
          "petBasicInfo.errors.databaseConnectionNotAvailable",
          translations,
          event
        );
      }
      
      try {
        // Use read connection for eye analysis logs
        const EyeAnalysis = readConn.model("EyeAnalysisRecord");
        if (!EyeAnalysis) {
          return createErrorResponse(
            500,
            "petBasicInfo.errors.eyeAnalysisModelNotFound",
            translations,
            event
          );
        }
        
        const eyeAnalysisLogList = await EyeAnalysis.find({petId: petID}).sort({createdAt: -1});
        console.log("EYE LOG LIST: ", eyeAnalysisLogList);
        return {
          statusCode: 200,
          body: JSON.stringify({
            result: eyeAnalysisLogList, 
            message: getTranslation(translations, "petBasicInfo.success.eyeLogRetrievedSuccessfully")
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (error) {
        console.error("Error fetching eye analysis log:", error);
        return createErrorResponse(
          500,
          "petBasicInfo.errors.errorRetrievingEyeLog",
          translations,
          event
        );
      }
    }
    else {
      // DELETE endpoint - validate HTTP method
      if (event.httpMethod !== "DELETE") {
        return createErrorResponse(
          405,
          "petBasicInfo.errors.methodNotAllowedDelete",
          translations,
          event
        );
      }
      
      // DELETE endpoint - pet already found and validated above
      try {
        // Connect to primary database for writes
        await connectToMongoDB();
        const PetModelDelete = mongoose.model("Pet");
        
        // do not delete
        // const deleteResult = await PetModelDelete.deleteOne({ _id: petID });

        await PetModelDelete.findByIdAndUpdate(
          petID,
          { deleted: true, 
            tagId: null,
          },
          { new: true, runValidators: true }
        );

        
        
        // Check if document was actually deleted
        // if (deleteResult.deletedCount === 0) {
        //   return createErrorResponse(
        //     404,
        //     "petBasicInfo.errors.petNotFoundOrDeleted",
        //     translations
        //   );
        // }

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: getTranslation(translations, "petBasicInfo.success.deletedSuccessfully"),
            petId: petID,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (error) {
        console.error("Error deleting pet:", error);
        return createErrorResponse(
          500,
          "petBasicInfo.errors.errorDeletingPet",
          translations,
          event
        );
      }
    }

  } catch (error) {
    console.error("Error in handler:", error);
    
    // Handle MongoDB connection errors specifically
    if (error.message && error.message.includes("Failed to connect to database")) {
      return createErrorResponse(
        503,
        "petBasicInfo.errors.databaseConnectionFailed",
        translations,
        event
      );
    }
    
    // Handle Mongoose errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message).join(', ');
      const baseError = getTranslation(translations, "petBasicInfo.errors.validationError");
      return createErrorResponse(
        400,
        `${baseError}: ${validationErrors}`,
        translations,
        event
      );
    }
    
    if (error.name === 'CastError') {
      const baseError = getTranslation(translations, "petBasicInfo.errors.invalidDataFormat");
      return createErrorResponse(
        400,
        `${baseError}: ${error.message}`,
        translations,
        event
      );
    }
    
    // Generic error response
    return createErrorResponse(
      500,
      "petBasicInfo.errors.internalServerError",
      translations,
      event
    );
  }
};