const mongoose = require("mongoose");
const { createErrorResponse } = require("../utils/response");

/**
 * Checks pet ownership against JWT identity.
 *
 * @param {Object} params
 * @param {Object} params.event - API Gateway event with userId, ngoId, userRole.
 * @param {Object} params.pet - Lean or hydrated Mongoose pet document.
 * @returns {{ isValid: true } | { isValid: false, error: Object }}
 */
function checkPetOwnership({ event, pet }) {
  const petUserId = pet.userId == null ? null : String(pet.userId);
  const petNgoId = pet.ngoId == null ? null : String(pet.ngoId);

  // Direct owner match
  if (event.userId && petUserId && String(event.userId) === petUserId) {
    return { isValid: true };
  }

  // NGO owner match
  if (
    event.userRole === "ngo" &&
    event.ngoId &&
    petNgoId &&
    String(event.ngoId) === petNgoId
  ) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: createErrorResponse(403, "eyeUpload.errors.forbidden", event),
  };
}

/**
 * Loads a pet by ID and enforces the route's ownership policy.
 * Returns a uniform 404 for missing/deleted pets.
 *
 * Call this at service start after DB bootstrap.
 *
 * @async
 * @param {Object} params
 * @param {Object} params.event - API Gateway event.
 * @param {string} params.petId - The pet document ID.
 * @param {Object} [params.options]
 * @param {boolean} [params.options.lean=true] - Whether to return a lean document.
 * @returns {Promise<
 *   { isValid: true, pet: Object } |
 *   { isValid: false, error: Object }
 * >}
 */
async function loadAuthorizedPet({ event, petId, options = {} }) {
  const lean = options.lean !== false;
  const Pet = mongoose.model("Pets");

  let query = Pet.findOne({ _id: petId, deleted: { $ne: true } });
  if (lean) query = query.lean();
  const pet = await query;

  if (!pet) {
    return {
      isValid: false,
      error: createErrorResponse(404, "eyeUpload.errors.petNotFound", event),
    };
  }

  const ownershipResult = checkPetOwnership({ event, pet });
  if (!ownershipResult.isValid) {
    return ownershipResult;
  }

  return { isValid: true, pet };
}

module.exports = {
  checkPetOwnership,
  loadAuthorizedPet,
};
