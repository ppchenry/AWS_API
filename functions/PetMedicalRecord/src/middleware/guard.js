const { createErrorResponse } = require("../utils/response");
const { isValidObjectId } = require("../utils/validators");

/**
 * Path parameter name map keyed by route resource pattern.
 * Each entry lists the ObjectId path params that appear in that resource.
 */
const RECORD_ID_PARAMS = {
  "/pets/{petID}/medical-record/{medicalID}": "medicalID",
  "/pets/{petID}/medication-record/{medicationID}": "medicationID",
  "/pets/{petID}/deworm-record/{dewormID}": "dewormID",
  "/pets/{petID}/blood-test-record/{bloodTestID}": "bloodTestID",
};

/**
 * Parses request bodies, validates required path identifiers, and enforces
 * cheap pre-DB request requirements.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} params
 * @returns {Promise<{ isValid: boolean, error?: any, body?: Record<string, any> | null }>}
 */
async function validateUserRequest({ event }) {
  const { body, pathParameters, httpMethod } = event;
  const method = httpMethod?.toUpperCase();
  // 1. JSON Body Parse
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

  // 2. Empty body check for POST/PUT
  if (
    (method === "PUT" || method === "POST") &&
    (!parsedBody || Object.keys(parsedBody).length === 0)
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  // 3. petID path param validation (present on all routes)
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

  // 4. Record-specific ID validation
  const recordIdParam = RECORD_ID_PARAMS[event.resource];
  if (recordIdParam) {
    const recordId = pathParameters?.[recordIdParam];
    if (!recordId) {
      return {
        isValid: false,
        error: createErrorResponse(400, _getMissingIdKey(recordIdParam), event),
      };
    }
    if (!isValidObjectId(recordId)) {
      return {
        isValid: false,
        error: createErrorResponse(400, _getInvalidIdKey(recordIdParam), event),
      };
    }
  }

  return { isValid: true, body: parsedBody };
}

/**
 * Maps record-id path params to the existing missing-id locale key contract.
 *
 * @private
 * @param {string} paramName
 * @returns {string}
 */
function _getMissingIdKey(paramName) {
  switch (paramName) {
    case "medicalID":
      return "medicalRecord.putMissingMedicalId";
    case "medicationID":
      return "medicationRecord.putMissingMedicationId";
    case "dewormID":
      return "dewormRecord.putMissingDewormId";
    case "bloodTestID":
      return "bloodTest.putMissingBloodTestId";
    default:
      return "others.missingParams";
  }
}

/**
 * Maps record-id path params to the existing invalid-id locale key contract.
 *
 * @private
 * @param {string} paramName
 * @returns {string}
 */
function _getInvalidIdKey(paramName) {
  switch (paramName) {
    case "medicalID":
      return "medicalRecord.invalidMedicalIdFormat";
    case "medicationID":
      return "medicationRecord.invalidMedicationIdFormat";
    case "dewormID":
      return "dewormRecord.invalidDewormIdFormat";
    case "bloodTestID":
      return "bloodTest.invalidBloodTestIdFormat";
    default:
      return "invalidPetIdFormat";
  }
}

module.exports = { validateUserRequest };
