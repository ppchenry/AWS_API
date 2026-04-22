const mongoose = require("mongoose");
const { createErrorResponse } = require("../utils/response");

/**
 * DB-free self-access policies keyed by exact route key.
 * This Lambda currently has no DB-free self-access routes, so the map is empty
 * and ownership is enforced through the DB-backed helper below.
 *
 * @type {Record<string, string>}
 */
const SELF_ACCESS_POLICIES = {};

/**
 * Validates DB-free self-access rules when a route can be authorized from
 * request data alone. For this Lambda there are no such routes, so validation
 * is opt-in and currently always passes.
 *
 * @returns {{ isValid: true }}
 */
function validateSelfAccess() {
  return { isValid: true };
}

/**
 * Loads a pet by ID and enforces the Lambda's DB-backed ownership policy.
 *
 * @param {Object} params
 * @param {import("aws-lambda").APIGatewayProxyEvent & { userId?: string, ngoId?: string }} params.event
 * @param {string} params.petId
 * @param {{ lean?: boolean }} [params.options]
 * @returns {Promise<
 *   { isValid: true, pet: Record<string, any> } |
 *   { isValid: false, error: ReturnType<typeof createErrorResponse> }
 * >}
 */
async function loadAuthorizedPet({ event, petId, options = {} }) {
  const lean = options.lean !== false;
  const Pet = mongoose.model("Pet");

  let query = Pet.findOne({ _id: petId, deleted: { $ne: true } })
    .select("_id userId ngoId deleted");

  if (lean) {
    query = query.lean();
  }

  const pet = await query;

  if (!pet) {
    return {
      isValid: false,
      error: createErrorResponse(404, "petMedicalRecord.errors.petNotFound", event),
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
      error: createErrorResponse(403, "common.forbidden", event),
    };
  }

  return { isValid: true, pet };
}

module.exports = {
  SELF_ACCESS_POLICIES,
  validateSelfAccess,
  loadAuthorizedPet,
};
