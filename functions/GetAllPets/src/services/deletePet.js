const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getTranslation, loadTranslations } = require("../utils/i18n");
const { isValidObjectId } = require("../utils/validators");
const { deletePetSchema } = require("../zodSchema/petSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { enforceRateLimit } = require("../utils/rateLimit");

/**
 * Soft-deletes a pet via atomic ownership-guarded updateOne.
 * Returns 200 on success, 404/409/403 on precondition failure.
 * @param {object} param0 - Route context
 * @param {object} param0.event - API Gateway event (with userId from JWT)
 * @param {object} param0.body - Parsed request body ({ petId })
 * @returns {Promise<object>} API Gateway response
 */
async function deletePet({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "petDelete",
      identifier: event.userId || "anonymous",
      limit: 10,
      windowSec: 60,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // Zod validation
    const parseResult = deletePetSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error, "getAllPets.errors.deleteStatus.missingPetId"),
        event
      );
    }

    const { petId } = parseResult.data;

    // Validate petId format
    if (!isValidObjectId(petId)) {
      return createErrorResponse(400, "getAllPets.errors.deleteStatus.invalidPetIdFormat", event);
    }

    const Pet = mongoose.model("Pet");

    // Atomic ownership-guarded soft-delete.
    // A single updateOne with all preconditions in the filter ensures no TOCTOU gap:
    // the pet must exist, not already be deleted, and be owned by the caller.
    const result = await Pet.updateOne(
      { _id: petId, userId: event.userId, deleted: { $ne: true } },
      { $set: { deleted: true } }
    );

    if (result.matchedCount === 1) {
      return createSuccessResponse(200, event, {
        message: getTranslation(
          loadTranslations(event.cookies?.language || "zh"),
          "getAllPets.success.deleteStatus.deleted"
        ),
        petId,
      });
    }

    // No match — determine which precondition failed for the correct error contract.
    const pet = await Pet.findOne({ _id: petId }).select("userId deleted").lean();

    if (!pet) {
      return createErrorResponse(404, "getAllPets.errors.deleteStatus.petNotFound", event);
    }
    if (pet.deleted === true) {
      return createErrorResponse(409, "getAllPets.errors.deleteStatus.petAlreadyDeleted", event);
    }
    // Pet exists and is not deleted, so the caller doesn't own it.
    return createErrorResponse(403, "common.unauthorized", event);
  } catch (error) {
    logError("Failed to delete pet", {
      scope: "services.deletePet.deletePet",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { deletePet };
