const { createErrorResponse } = require("../utils/response");
const { isValidObjectId } = require("../utils/validators");
const { validateSelfAccess } = require("./selfAccess");

/**
 * Validates the incoming request before DB connection.
 * Handles JSON parse, empty body check, self-access, and path parameter validation.
 */
async function validatePetRequest({ event }) {
  const { body, pathParameters, httpMethod } = event;
  const method = httpMethod?.toUpperCase();
  const routeKey = `${method} ${event.resource}`;
  const userId = pathParameters?.userId;

  // JSON Body Check
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

  // Body Requirement Check (for POST/PUT mutations)
  if (
    (method === "PUT" || method === "POST") &&
    (!parsedBody || Object.keys(parsedBody).length === 0)
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  // Self-access enforcement (cheap, pre-DB: path-based identity checks)
  const selfAccessResult = validateSelfAccess({
    event,
    routeKey,
    pathUserId: userId,
  });

  if (!selfAccessResult.isValid) {
    return {
      isValid: false,
      error: selfAccessResult.error,
    };
  }

  // Path parameter ObjectId validation
  const ngoId = pathParameters?.ngoId;

  if (ngoId && !isValidObjectId(ngoId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "ngoPath.invalidNgoIdFormat", event),
    };
  }

  if (userId && !isValidObjectId(userId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "getPetsByUser.invalidUserIdFormat", event),
    };
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validatePetRequest };
