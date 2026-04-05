const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { createErrorResponse } = require('../utils/response');

/**
 * @typedef {Object} ValidationSuccess
 * @property {true} isValid
 * @property {Object|null} body - The parsed JSON body.
 * @property {Object} data - The Mongoose pet document.
 * * @typedef {Object} ValidationError
 * @property {false} isValid
 * @property {import('aws-lambda').APIGatewayProxyResult} error - Standardized error response.
 */

/**
 * Validates request body, pet ID format, and existence in database.
 * * @async
 * @param {Object} request
 * @param {import('aws-lambda').APIGatewayProxyEvent} request.event
 * @param {Object} request.translations
 * @returns {Promise<ValidationSuccess | ValidationError>}
 */
async function validatePetRequest({ event, translations }) {
  const { body, pathParameters, httpMethod } = event;
  const petID = pathParameters?.petID;
  const method = httpMethod?.toUpperCase();

  // Parse Body
  let parsedBody = null;
  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "petBasicInfo.errors.invalidJSON", translations, event)
      };
    }
  }

  // Ensure Body is present for mutations
  if ((method === 'PUT' || method === 'POST') && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petBasicInfo.errors.emptyUpdateBody", translations, event)
    };
  }

  // Validate ID Format
  if (!petID || !isValidObjectId(petID)) {
    return { 
      isValid: false, 
      error: createErrorResponse(400, "petBasicInfo.errors.invalidPetIdFormat", translations, event) 
    };
  }

  // Fetch from DB
  const Pet = mongoose.model("Pet");
  const pet = await Pet.findById(petID).lean();

  // Check existence and soft-delete status
  if (!pet || pet.deleted) {
    return { 
      isValid: false, 
      error: createErrorResponse(
        pet?.deleted ? 410 : 404,
        pet?.deleted ? "petBasicInfo.errors.petDeleted" : "petBasicInfo.errors.petNotFound",
        translations, 
        event
      ) 
    };
  }

  return { isValid: true, body: parsedBody, data: pet };
};

module.exports = { validatePetRequest };