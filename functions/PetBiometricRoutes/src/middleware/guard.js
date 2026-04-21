const { createErrorResponse } = require("../utils/response");
const { isValidObjectId } = require("../utils/validators");

const ROUTES_REQUIRING_BODY = new Set([
  "POST /petBiometrics/register",
  "POST /petBiometrics/verifyPet",
]);

const ROUTES_WITH_OPTIONAL_BODY_USER = new Set([
  "POST /petBiometrics/register",
  "POST /petBiometrics/verifyPet",
]);

/**
 * Performs cheap request validation before any database connection is used.
 *
 * Responsibilities: JSON parsing, empty-body rejection on write routes,
 * body/JWT identity mismatch rejection, and GET path ObjectId validation.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any> }} request
 * @returns {Promise<{ isValid: boolean, error?: import("aws-lambda").APIGatewayProxyResult, body?: Record<string, any> | null }>}
 */
async function validatePetBiometricRequest({ event }) {
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const method = event.httpMethod?.toUpperCase();

  let parsedBody = null;
  if (typeof event.body === "string" && event.body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "others.invalidJSON", event),
      };
    }
  }

  if (ROUTES_REQUIRING_BODY.has(routeKey) && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  if (
    ROUTES_WITH_OPTIONAL_BODY_USER.has(routeKey) &&
    typeof parsedBody?.userId === "string" &&
    event.userId &&
    parsedBody.userId !== event.userId
  ) {
    return {
      isValid: false,
      error: createErrorResponse(403, "petBiometric.forbidden", event),
    };
  }

  if (method === "GET") {
    const petId = event.pathParameters?.petId;
    if (!isValidObjectId(petId)) {
      return {
        isValid: false,
        error: createErrorResponse(400, "petBiometric.invalidPetId", event),
      };
    }
  }

  return {
    isValid: true,
    body: parsedBody,
  };
}

module.exports = { validatePetBiometricRequest };