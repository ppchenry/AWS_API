const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { createErrorResponse } = require('../utils/response');

/**
 * Validates the request body, pet ID, and pet existence before any service logic runs.
 * Returns a standardized error response payload when the body is not valid JSON,
 * the pet ID is invalid, or the pet cannot be found or has been soft-deleted.
 *
 * @param {{event: import("aws-lambda").APIGatewayProxyEvent | Record<string, any>, body?: string | null, petID?: string, translations: Record<string, any>}} request Prepared request data containing the raw body, pet ID, translation map, and original event.
 * @returns {Promise<
 *   | { isValid: true, body: Record<string, any> | null, data: any } // body: parsed JSON object if present, or null if no body
 *   | { isValid: false, error: { statusCode: number, headers: Record<string, string>, body: string } }
 * >} Validation result containing either the parsed body (object or null) and pet document, or an error response.
 */
const validatePetRequest = async (request) => {
  const { event, body, petID, translations } = request;

  let parsedBody = null;
  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(
          400,
          "petBasicInfo.errors.invalidJSON",
          translations,
          event
        )
      };
    }
  }

  const method = event?.httpMethod?.toUpperCase();
  if ((method === 'PUT' || method === 'POST') && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(
        400,
        "petBasicInfo.errors.emptyUpdateBody",
        translations,
        event
      )
    };
  }

  if (!petID || !isValidObjectId(petID)) {
    return { 
      isValid: false, 
      error: createErrorResponse(
        400, 
        "petBasicInfo.errors.invalidPetIdFormat", 
        translations, 
        event
      ) 
    };
  }

  const Pet = mongoose.model("Pet");
  const pet = await Pet.findById(petID).lean();

  if (!pet || pet.deleted) {
    return { 
      isValid: false, 
      error: createErrorResponse(
        pet?.deleted ? 410 : 404,
        pet?.deleted
          ? "petBasicInfo.errors.petDeleted"
          : "petBasicInfo.errors.petNotFound",
        translations, 
        event
      ) 
    };
  }

  return { isValid: true, body: parsedBody, data: pet };
};

module.exports = { validatePetRequest };