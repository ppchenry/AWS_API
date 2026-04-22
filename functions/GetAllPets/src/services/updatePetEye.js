const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getTranslation, loadTranslations } = require("../utils/i18n");
const { isValidObjectId, isValidDateFormat, isValidImageUrl } = require("../utils/validators");
const { updatePetEyeSchema } = require("../zodSchema/petSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { sanitizePet } = require("../utils/sanitize");
const { enforceRateLimit } = require("../utils/rateLimit");

/**
 * Appends eye images to a pet via atomic ownership-guarded findOneAndUpdate.
 * Returns 201 on success, 404/410/403 on precondition failure.
 * @param {object} param0 - Route context
 * @param {object} param0.event - API Gateway event (with userId from JWT)
 * @param {object} param0.body - Parsed request body ({ petId, date, leftEyeImage1PublicAccessUrl, rightEyeImage1PublicAccessUrl })
 * @returns {Promise<object>} API Gateway response
 */
async function updatePetEye({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "petEyeUpdate",
      identifier: event.userId || "anonymous",
      limit: 10,
      windowSec: 60,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // Zod validation
    const parseResult = updatePetEyeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error, "getAllPets.errors.updatePetEye.missingRequiredFields"),
        event
      );
    }

    const { petId, date, leftEyeImage1PublicAccessUrl, rightEyeImage1PublicAccessUrl } =
      parseResult.data;

    // Validate petId format
    if (!isValidObjectId(petId)) {
      return createErrorResponse(400, "getAllPets.errors.updatePetEye.invalidPetIdFormat", event);
    }

    // Validate date format
    if (!isValidDateFormat(date)) {
      return createErrorResponse(400, "getAllPets.errors.updatePetEye.invalidDateFormat", event);
    }

    // Validate image URLs
    if (!isValidImageUrl(leftEyeImage1PublicAccessUrl)) {
      return createErrorResponse(400, "getAllPets.errors.updatePetEye.invalidImageUrlFormat", event);
    }

    if (!isValidImageUrl(rightEyeImage1PublicAccessUrl)) {
      return createErrorResponse(400, "getAllPets.errors.updatePetEye.invalidImageUrlFormat", event);
    }

    const Pet = mongoose.model("Pet");

    // Create new eye image entry
    const newInformation = {
      date: new Date(date),
      eyeimage_left1: leftEyeImage1PublicAccessUrl,
      eyeimage_right1: rightEyeImage1PublicAccessUrl,
    };

    // Atomic ownership-guarded update.
    // A single findOneAndUpdate with all preconditions in the filter ensures no TOCTOU gap:
    // the pet must exist, not be deleted, and be owned by the caller.
    const updatedPet = await Pet.findOneAndUpdate(
      { _id: petId, userId: event.userId, deleted: { $ne: true } },
      { $push: { eyeimages: newInformation } },
      { new: true, lean: true }
    );

    if (updatedPet) {
      return createSuccessResponse(201, event, {
        message: getTranslation(
          loadTranslations(event.cookies?.language || "zh"),
          "getAllPets.success.updatePetEye.updated"
        ),
        result: sanitizePet(updatedPet),
      });
    }

    // No match — determine which precondition failed for the correct error contract.
    const pet = await Pet.findOne({ _id: petId }).select("userId deleted").lean();

    if (!pet) {
      return createErrorResponse(404, "getAllPets.errors.updatePetEye.petNotFound", event);
    }
    if (pet.deleted === true) {
      return createErrorResponse(410, "getAllPets.errors.updatePetEye.petDeleted", event);
    }
    // Pet exists and is not deleted, so the caller doesn't own it.
    return createErrorResponse(403, "common.unauthorized", event);
  } catch (error) {
    logError("Failed to update pet eye", {
      scope: "services.updatePetEye.updatePetEye",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { updatePetEye };
