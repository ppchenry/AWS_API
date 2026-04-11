const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { createErrorResponse } = require('../utils/response');
const { checkPetOwnership } = require('./selfAccess');

/**
 * Validates the incoming request: parses the body, checks the petID format, opens
 * the DB connection (provided by the caller), then fetches the pet and enforces
 * ownership. Single unified entry point — the handler calls this once after the DB
 * is ready.
 *
 * @async
 * @param {Object} params
 * @param {import('aws-lambda').APIGatewayProxyEvent} params.event
 * @returns {Promise<
 *   { isValid: true, petID: string, body: Object|null, data: Object } |
 *   { isValid: false, error: import('aws-lambda').APIGatewayProxyResult }
 * >}
 */
async function validateRequest({ event }) {
  const { body, pathParameters, httpMethod } = event;
  const petID = pathParameters?.petID;
  const method = httpMethod?.toUpperCase();

  // 1. Parse body
  let parsedBody = null;
  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "petBasicInfo.errors.invalidJSON", event),
      };
    }
  }

  // 2. Require body for mutations
  if ((method === 'PUT' || method === 'POST') && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petBasicInfo.errors.emptyUpdateBody", event),
    };
  }

  // 3. Validate petID format
  if (!petID || !isValidObjectId(petID)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petBasicInfo.errors.invalidPetIdFormat", event),
    };
  }

  // 4. Fetch pet from DB
  const Pet = mongoose.model("Pet");
  const pet = await Pet.findById(petID).lean();

  // 5. Existence check — return 404 for both missing and soft-deleted pets
  //    (uniform response: callers must not be able to distinguish deleted from never-existed)
  if (!pet || pet.deleted) {
    return {
      isValid: false,
      error: createErrorResponse(404, "petBasicInfo.errors.petNotFound", event),
    };
  }

  // 6. Ownership check (policy-driven via SELF_ACCESS_POLICIES)
  const routeKey = `${event.httpMethod?.toUpperCase()} ${event.resource}`;
  const ownershipResult = checkPetOwnership({ event, pet, routeKey });
  if (!ownershipResult.isValid) {
    return ownershipResult;
  }

  return { isValid: true, petID, body: parsedBody, data: pet };
}

module.exports = { validateRequest };