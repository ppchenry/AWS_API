const mongoose = require("mongoose");
const { parseDDMMYYYY } = require("../utils/dateParser");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { petBasicInfoUpdateSchema } = require("../zodSchema/petBasicInfoSchema");

/**
 * Retrieve pet basic info and return a formatted response.
 * @param {Object} routeConext - Context object containing pet, event, and translations.
 * @param {Object} routeConext.pet - The pet Mongoose document.
 * @param {Object} routeConext.event - The Lambda event object.
 * @param {Object} routeConext.translations - Translations for i18n.
 * @returns {Promise<Object>} Lambda response with pet info or error.
 */
async function getPetBasicInfo(routeConext) {
  const { pet, event, translations } = routeConext;

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
  
  return createSuccessResponse(
    "petBasicInfo.success.retrievedSuccessfully",
    { form, id: pet._id },
    translations,
    event
  );
}

/**
 * Update pet basic info fields (excluding tagId, ngoPetId) after Zod validation.
 * Strips tagId and ngoPetId to prevent updates. Transforms date and location fields.
 * @param {Object} routeConext - Context object containing body, translations, event.
 * @param {Object} routeConext.body - The parsed request body.
 * @param {Object} routeConext.translations - Translations for i18n.
 * @param {Object} routeConext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with update result or error.
 */
async function updatePetBasicInfo(routeConext) {
  const { body, translations, event, petID, pet } = routeConext;

  const validatedBody = petBasicInfoUpdateSchema.safeParse(body);
  
  if (!validatedBody.success) {
    const errorMessage = validatedBody.error.issues[0]?.message || "Validation error";
    return createErrorResponse(
      400,
      errorMessage,
      translations,
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
      translations, 
      event
    );
  }

  try {
    const PetModel = mongoose.model("Pet");
    await PetModel.findByIdAndUpdate(petID, { $set: setFields }, { runValidators: true });
    
    return createSuccessResponse(
      "petBasicInfo.success.updatedSuccessfully",
      { id: pet._id },
      translations,
      event
    );
  } catch (error) {
    return createErrorResponse(
      500, 
      "petBasicInfo.errors.databaseError", 
      translations, 
      event
    );
  }
}

/**
 * Soft-delete a pet by setting deleted: true and tagId: null.
 * @param {Object} routeContext - Context object containing petID, translations, event.
 * @param {string} routeContext.petID - The pet's MongoDB ObjectId.
 * @param {Object} routeContext.translations - Translations for i18n.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with delete result or error.
 */
async function deletePetBasicInfo(routeContext) {
  const { petID, translations, event } = routeContext;

  try {
    const PetModel = mongoose.model("Pet");

    await PetModel.findByIdAndUpdate(
      petID,
      { 
        $set: { 
          deleted: true, 
          tagId: null 
        } 
      }
    );

    return createSuccessResponse(
      "petBasicInfo.success.deletedSuccessfully",
      { petId: petID },
      translations,
      event
    );
  } catch (error) {    
    return createErrorResponse(
      500,
      "petBasicInfo.errors.errorDeletingPet",
      translations,
      event
    );
  }
}

module.exports = { getPetBasicInfo, updatePetBasicInfo, deletePetBasicInfo };