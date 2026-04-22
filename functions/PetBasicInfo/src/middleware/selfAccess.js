const mongoose = require("mongoose");
const { createErrorResponse } = require('../utils/response');

/**
 * Policy map: route key → ownership strategy.
 *   'petOwnerOrNgo' — JWT userId must match pet.userId, OR JWT ngoId must match pet.ngoId.
 *
 * Add new route keys here when introducing routes with different ownership semantics.
 * Guard calls checkPetOwnership with the resolved policy; unknown route keys pass through.
 */
const SELF_ACCESS_POLICIES = {
  'GET /pets/{petID}/basic-info':  'petOwnerOrNgo',
  'PUT /pets/{petID}/basic-info':  'petOwnerOrNgo',
  'DELETE /pets/{petID}':          'petOwnerOrNgo',
  'GET /pets/{petID}/eyeLog':      'petOwnerOrNgo',
};

/**
 * Verifies that the requesting user owns the given pet, either by direct user
 * ownership (JWT userId === pet.userId) or by NGO ownership (JWT ngoId === pet.ngoId).
 *
 * @param {Object} params
 * @param {import('aws-lambda').APIGatewayProxyEvent} params.event
 * @param {Object} params.pet - Lean Mongoose pet document.
 * @param {string} params.routeKey - e.g. "GET /pets/{petID}/basic-info"
 * @returns {{ isValid: true } | { isValid: false, error: import('aws-lambda').APIGatewayProxyResult }}
 */
function checkPetOwnership({ event, pet, routeKey }) {
  const policy = SELF_ACCESS_POLICIES[routeKey];
  if (!policy) {
    return { isValid: true };
  }

  const requestNgoId = event.ngoId;
  const petUserId = pet.userId == null ? null : String(pet.userId);
  const petNgoId = pet.ngoId == null ? null : String(pet.ngoId);

  if (event.userId && petUserId && String(event.userId) === petUserId) {
    return { isValid: true };
  }

  if (requestNgoId && petNgoId && String(requestNgoId) === petNgoId) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: createErrorResponse(403, 'common.unauthorized', event),
  };
}

/**
 * Loads the requested pet from MongoDB and enforces the route's ownership policy.
 * Returns a uniform 404 for missing or soft-deleted pets so callers do not learn
 * whether a record ever existed.
 *
 * @async
 * @param {Object} params
 * @param {import('aws-lambda').APIGatewayProxyEvent} params.event
 * @returns {Promise<
 *   { isValid: true, pet: Object } |
 *   { isValid: false, error: import('aws-lambda').APIGatewayProxyResult }
 * >}
 */
async function loadAuthorizedPet({ event }) {
  const Pet = mongoose.model("Pet");
  const pet = await Pet.findById(event.pathParameters?.petID).lean();

  if (!pet || pet.deleted) {
    return {
      isValid: false,
      error: createErrorResponse(404, "petBasicInfo.errors.petNotFound", event),
    };
  }

  const routeKey = `${event.httpMethod?.toUpperCase()} ${event.resource}`;
  const ownershipResult = checkPetOwnership({ event, pet, routeKey });
  if (!ownershipResult.isValid) {
    return ownershipResult;
  }

  return {
    isValid: true,
    pet,
  };
}

module.exports = { checkPetOwnership, loadAuthorizedPet, SELF_ACCESS_POLICIES };
