const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getTranslation, loadTranslations } = require("../utils/i18n");
const { isValidObjectId } = require("../utils/validators");
const { deletePetSchema } = require("../zodSchema/petSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");

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
    // Zod validation
    const parseResult = deletePetSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error, "deleteStatus.missingPetId"),
        event
      );
    }

    const { petId } = parseResult.data;

    // Validate petId format
    if (!isValidObjectId(petId)) {
      return createErrorResponse(400, "deleteStatus.invalidPetIdFormat", event);
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
          "deleteStatus.success"
        ),
        petId,
      });
    }

    // No match — determine which precondition failed for the correct error contract.
    const pet = await Pet.findOne({ _id: petId }).select("userId deleted").lean();

    if (!pet) {
      return createErrorResponse(404, "deleteStatus.petNotFound", event);
    }
    if (pet.deleted === true) {
      return createErrorResponse(409, "deleteStatus.petAlreadyDeleted", event);
    }
    // Pet exists and is not deleted, so the caller doesn't own it.
    return createErrorResponse(403, "others.unauthorized", event);
  } catch (error) {
    logError("Failed to delete pet", {
      scope: "services.deletePet.deletePet",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { deletePet };
