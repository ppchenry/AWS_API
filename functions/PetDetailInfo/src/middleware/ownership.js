const mongoose = require("mongoose");
const { createErrorResponse } = require("../utils/response");

/**
 * Verifies the authenticated caller owns the pet (or is an NGO managing it).
 * Must run AFTER authJWT (event.userId / event.ngoId populated)
 * and AFTER DB connection is established.
 *
 * Returns null on success (attaches event._pet for downstream reuse),
 * or an error response to short-circuit.
 */
async function authorizeOwnership({ event }) {
  const petID = event.pathParameters?.petID;
  if (!petID) return null; // guard already rejects missing petID

  const Pet = mongoose.model("Pet");
  const pet = await Pet.findOne({ _id: petID, deleted: false })
    .select("_id userId ngoId")
    .lean();

  if (!pet) {
    return createErrorResponse(404, "petNotFound", event);
  }

  const callerUserId = event.userId;
  const callerNgoId = event.ngoId;

  const isOwner = pet.userId && String(pet.userId) === String(callerUserId);
  const isNgo = callerNgoId && pet.ngoId && String(pet.ngoId) === String(callerNgoId);

  if (!isOwner && !isNgo) {
    return createErrorResponse(403, "others.forbidden", event);
  }

  // Attach verified pet so services can skip the ownership re-fetch
  event._pet = pet;

  return null;
}

module.exports = { authorizeOwnership };
