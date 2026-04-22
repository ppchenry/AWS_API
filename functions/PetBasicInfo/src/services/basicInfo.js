const mongoose = require("mongoose");
const { parseDDMMYYYY } = require("../utils/dateParser");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { petBasicInfoUpdateSchema } = require("../zodSchema/petBasicInfoSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { sanitizePet } = require("../utils/sanitize");
const { enforceRateLimit } = require("../utils/rateLimit");
const { loadAuthorizedPet } = require("../middleware/selfAccess");

/**
 * Retrieve pet basic info and return a formatted response.
 * @param {Object} routeContext - Context object containing event.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with pet info or error.
 */
async function getPetBasicInfo(routeContext) {
  const { event } = routeContext;

  try {
    const petResult = await loadAuthorizedPet({ event });
    if (!petResult.isValid) {
      return petResult.error;
    }

    const { pet } = petResult;

    return createSuccessResponse(200, event, {
      message: "petBasicInfo.success.retrievedSuccessfully",
      form: sanitizePet(pet),
      id: pet._id,
    });
  } catch (error) {
    logError("Failed to retrieve pet basic info", {
      scope: "services.basicInfo.getPetBasicInfo",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Update pet basic info fields (excluding tagId, ngoPetId) after Zod validation.
 * Strips tagId and ngoPetId to prevent updates. Transforms date and location fields.
 * @param {Object} routeContext - Context object containing body and event.
 * @param {Object} routeContext.body - The parsed request body.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with update result or error.
 */
async function updatePetBasicInfo(routeContext) {
  const { body, event } = routeContext;
  const petID = event.pathParameters?.petID;

  try {
    const validatedBody = petBasicInfoUpdateSchema.safeParse(body);

    if (!validatedBody.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(validatedBody.error, "petBasicInfo.errors.validationError"),
        event
      );
    }

    const updates = validatedBody.data;
    const setFields = { ...updates };

    if (updates.location !== undefined) {
      setFields.locationName = updates.location;
      delete setFields.location;
    }

    const dateFields = ["birthday", "receivedDate", "sterilizationDate"];
    dateFields.forEach((field) => {
      if (updates[field]) {
        setFields[field] = parseDDMMYYYY(updates[field]);
      }
    });

    if (Object.keys(setFields).length === 0) {
      return createErrorResponse(400, "petBasicInfo.errors.noValidFieldsToUpdate", event);
    }

    const petResult = await loadAuthorizedPet({ event });
    if (!petResult.isValid) {
      return petResult.error;
    }

    const PetModel = mongoose.model("Pet");
    const updatedPet = await PetModel.findByIdAndUpdate(
      petID,
      { $set: setFields },
      { runValidators: true, new: true }
    ).lean();

    if (!updatedPet) {
      return createErrorResponse(404, "petBasicInfo.errors.petNotFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "petBasicInfo.success.updatedSuccessfully",
      id: petResult.pet._id,
    });
  } catch (error) {
    logError("Failed to update pet basic info", {
      scope: "services.basicInfo.updatePetBasicInfo",
      event,
      error,
      extra: { petID },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Soft-delete a pet by setting deleted: true and tagId: null.
 * @param {Object} routeContext - Context object containing event.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with delete result or error.
 */
async function deletePetBasicInfo(routeContext) {
  const { event } = routeContext;
  const petID = event.pathParameters?.petID;

  try {
    // Rate limiting is the first step of service execution for destructive operations.
    const rl = await enforceRateLimit({
      event,
      action: "petDelete",
      identifier: event.userId || "anonymous",
      limit: 10,
      windowSec: 60,
    });
    if (!rl.allowed) return createErrorResponse(429, "common.rateLimited", event);

    const petResult = await loadAuthorizedPet({ event });
    if (!petResult.isValid) {
      return petResult.error;
    }

    const PetModel = mongoose.model("Pet");

    const deletedPet = await PetModel.findOneAndUpdate(
      { _id: petID, deleted: false },
      { 
        $set: { 
          deleted: true, 
          tagId: null 
        } 
      },
      { new: true }
    );

    if (!deletedPet) {
      return createErrorResponse(404, "petBasicInfo.errors.petNotFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "petBasicInfo.success.deletedSuccessfully",
      petId: petID,
    });
  } catch (error) {    
    logError("Failed to delete pet", {
      scope: "services.basicInfo.deletePetBasicInfo",
      event,
      error,
      extra: {
        petID,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { getPetBasicInfo, updatePetBasicInfo, deletePetBasicInfo };