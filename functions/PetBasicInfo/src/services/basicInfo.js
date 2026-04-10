const mongoose = require("mongoose");
const { parseDDMMYYYY } = require("../utils/dateParser");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { petBasicInfoUpdateSchema } = require("../zodSchema/petBasicInfoSchema");

/**
 * Retrieve pet basic info and return a formatted response.
 * @param {Object} routeContext - Context object containing pet and event.
 * @param {Object} routeContext.pet - The pet Mongoose document.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with pet info or error.
 */
async function getPetBasicInfo(routeContext) {
  const { pet, event } = routeContext;

  const petObj = pet.toObject ? pet.toObject() : pet;

  const form = {
    userId: petObj.userId,
    name: petObj.name,
    breedimage: petObj.breedimage,
    animal: petObj.animal,
    birthday: petObj.birthday,
    weight: petObj.weight,
    sex: petObj.sex,
    sterilization: petObj.sterilization,
    sterilizationDate: petObj.sterilizationDate,
    adoptionStatus: petObj.adoptionStatus,
    breed: petObj.breed,
    bloodType: petObj.bloodType,
    features: petObj.features,
    info: petObj.info,
    status: petObj.status,
    owner: petObj.owner,
    ngoId: petObj.ngoId,
    ownerContact1: petObj.ownerContact1,
    ownerContact2: petObj.ownerContact2,
    contact1Show: petObj.contact1Show,
    contact2Show: petObj.contact2Show,
    tagId: petObj.tagId,
    isRegistered: petObj.isRegistered,
    receivedDate: petObj.receivedDate,
    ngoPetId: petObj.ngoPetId,
    createdAt: petObj.createdAt,
    updatedAt: petObj.updatedAt,
    location: petObj.locationName,
    position: petObj.position,
  };
  
  return createSuccessResponse(200, event, {
    message: "petBasicInfo.success.retrievedSuccessfully",
    form,
    id: pet._id,
  });
}

/**
 * Update pet basic info fields (excluding tagId, ngoPetId) after Zod validation.
 * Strips tagId and ngoPetId to prevent updates. Transforms date and location fields.
 * @param {Object} routeContext - Context object containing body, pet, event, and petID.
 * @param {Object} routeContext.body - The parsed request body.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with update result or error.
 */
async function updatePetBasicInfo(routeContext) {
  const { body, event, pet } = routeContext;
  const petID = event.pathParameters?.petID;

  const validatedBody = petBasicInfoUpdateSchema.safeParse(body);
  
  if (!validatedBody.success) {
    const errorMessage = validatedBody.error.issues[0]?.message || "petBasicInfo.errors.validationError";
    return createErrorResponse(
      400,
      errorMessage,
      event
    );
  }

  const updates = validatedBody.data;
  const setFields = { ...updates };

  if (updates.location !== undefined) {
    setFields.locationName = updates.location;
    delete setFields.location; // Remove the frontend key
  }

  const dateFields = ['birthday', 'receivedDate', 'sterilizationDate'];
  dateFields.forEach(field => {
    if (updates[field]) {
      setFields[field] = parseDDMMYYYY(updates[field]);
    }
  });

  if (Object.keys(setFields).length === 0) {
    return createErrorResponse(
      400, 
      "petBasicInfo.errors.noValidFieldsToUpdate", 
      event
    );
  }

  try {
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
      id: pet._id,
    });
  } catch (error) {
    logError("Failed to update pet basic info", {
      scope: "services.basicInfo.updatePetBasicInfo",
      event,
      error,
      extra: {
        petID,
      },
    });
    return createErrorResponse(
      500, 
      "petBasicInfo.errors.errorUpdatingPet", 
      event
    );
  }
}

/**
 * Soft-delete a pet by setting deleted: true and tagId: null.
 * @param {Object} routeContext - Context object containing petID and event.
 * @param {string} routeContext.petID - The pet's MongoDB ObjectId.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with delete result or error.
 */
async function deletePetBasicInfo(routeContext) {
  const { event } = routeContext;
  const petID = event.pathParameters?.petID;

  try {
    const PetModel = mongoose.model("Pet");

    const deletedPet = await PetModel.findByIdAndUpdate(
      petID,
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
    return createErrorResponse(
      500,
      "petBasicInfo.errors.errorDeletingPet",
      event
    );
  }
}

module.exports = { getPetBasicInfo, updatePetBasicInfo, deletePetBasicInfo };