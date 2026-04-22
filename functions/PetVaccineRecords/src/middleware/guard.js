const { createErrorResponse } = require("../utils/response");
const { isValidObjectId } = require("../utils/validators");

const RECORD_ID_PARAMS = {
  "/pets/{petID}/vaccine-record/{vaccineID}": "vaccineID",
};

async function validateUserRequest({ event }) {
  const { body, pathParameters, httpMethod } = event;
  const method = httpMethod?.toUpperCase();
  let parsedBody = null;

  if (typeof body === "string" && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "others.invalidJSON", event),
      };
    }
  }

  if (
    (method === "POST" || method === "PUT") &&
    (!parsedBody || Object.keys(parsedBody).length === 0)
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  const petID = pathParameters?.petID;
  if (!petID) {
    return {
      isValid: false,
      error: createErrorResponse(400, "missingPetId", event),
    };
  }

  if (!isValidObjectId(petID)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "invalidPetIdFormat", event),
    };
  }

  const recordIdParam = RECORD_ID_PARAMS[event.resource];
  if (recordIdParam) {
    const recordId = pathParameters?.[recordIdParam];
    if (!recordId) {
      return {
        isValid: false,
        error: createErrorResponse(400, "vaccineRecord.putMissingVaccineId", event),
      };
    }

    if (!isValidObjectId(recordId)) {
      return {
        isValid: false,
        error: createErrorResponse(400, "vaccineRecord.invalidVaccineIdFormat", event),
      };
    }
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validateUserRequest };