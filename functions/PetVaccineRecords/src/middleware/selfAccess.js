const mongoose = require("mongoose");
const { createErrorResponse } = require("../utils/response");

const SELF_ACCESS_POLICIES = {};

function validateSelfAccess() {
  return { isValid: true };
}

async function loadAuthorizedPet({ event, petId, options = {} }) {
  const lean = options.lean !== false;
  const Pet = mongoose.model("Pet");

  let query = Pet.findById(petId).select("_id userId ngoId deleted");
  if (lean) {
    query = query.lean();
  }

  const pet = await query;

  if (!pet) {
    return {
      isValid: false,
      error: createErrorResponse(404, "petNotFound", event),
    };
  }

  if (pet.deleted === true) {
    return {
      isValid: false,
      error: createErrorResponse(410, "petDeleted", event),
    };
  }

  const isOwner =
    pet.userId != null &&
    event.userId != null &&
    String(pet.userId) === String(event.userId);

  const isNgo =
    pet.ngoId != null &&
    event.ngoId != null &&
    String(pet.ngoId) === String(event.ngoId);

  if (!isOwner && !isNgo) {
    return {
      isValid: false,
      error: createErrorResponse(403, "others.forbidden", event),
    };
  }

  return { isValid: true, pet };
}

module.exports = {
  SELF_ACCESS_POLICIES,
  validateSelfAccess,
  loadAuthorizedPet,
};