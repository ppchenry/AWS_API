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
 *   | { isValid: true, body: Record<string, any>, data: any }
 *   | { isValid: false, error: { statusCode: number, headers: Record<string, string>, body: string } }
 * >} Validation result containing either the parsed body and pet document or an error response.
 */
export const validatePetRequest = async (request) => {
  const { event, body, petID, translations } = request;
  let parsedBody = {};

  try {
    parsedBody = body ? JSON.parse(body) : {};
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
  const pet = await Pet.findById(petID);

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


