const { isValidObjectId } = require("../utils/validators");
const { createErrorResponse } = require("../utils/response");

// Routes restricted to NGO-role callers (checked before DB/ownership)
const NGO_ONLY_RESOURCES = new Set([
  "/pets/{petID}/detail-info/NGOtransfer",
]);

async function validatePetDetailRequest({ event }) {
  const { body, pathParameters, httpMethod, resource } = event;
  const method = httpMethod?.toUpperCase();

  // 0. NGO-role gate (cheap, no DB)
  if (NGO_ONLY_RESOURCES.has(resource)) {
    const callerRole = event.userRole;
    if (!callerRole || callerRole.toLowerCase() !== "ngo") {
      return {
        isValid: false,
        error: createErrorResponse(403, "others.ngoOnly", event),
      };
    }
  }

  // 1. JSON body parse
  let parsedBody = null;
  if (typeof body === "string" && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.invalidJSON", event),
      };
    }
  }

  // 2. Empty body check on POST/PUT
  if (
    (method === "PUT" || method === "POST") &&
    (!parsedBody || Object.keys(parsedBody).length === 0)
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  // 3. petID path parameter validation (present on all routes)
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

  // 4. Sub-resource ID validation (transferId, sourceId, adoptionId)
  const transferId = pathParameters?.transferId;
  if (transferId !== undefined && !isValidObjectId(transferId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "transferPath.invalidTransferIdFormat", event),
    };
  }

  const sourceId = pathParameters?.sourceId;
  if (sourceId !== undefined && !isValidObjectId(sourceId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petSource.invalidSourceIdFormat", event),
    };
  }

  const adoptionId = pathParameters?.adoptionId;
  if (adoptionId !== undefined && !isValidObjectId(adoptionId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petAdoption.invalidAdoptionIdFormat", event),
    };
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validatePetDetailRequest };
