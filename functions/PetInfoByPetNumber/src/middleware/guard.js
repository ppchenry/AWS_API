const { createErrorResponse } = require("../utils/response");

function validatePetLookupRequest({ event }) {
  let parsedBody = null;

  if (typeof event.body === "string" && event.body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "others.invalidJSON", event),
      };
    }
  }

  const tagId = typeof event.pathParameters?.tagId === "string"
    ? event.pathParameters.tagId.trim()
    : "";

  if (!tagId) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petInfoByPetNumber.errors.tagIdRequired", event),
    };
  }

  if (tagId.length > 120) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.invalidPathParam", event),
    };
  }

  return {
    isValid: true,
    body: parsedBody,
    tagId,
  };
}

module.exports = { validatePetLookupRequest };