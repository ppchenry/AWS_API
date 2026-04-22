const mongoose = require("mongoose");
const { createErrorResponse } = require("../utils/response");

/**
 * Lightweight request pre-validation.
 *
 * Most EyeUpload routes use multipart/form-data, so JSON body parsing
 * only applies to /analysis/breed. Path parameter validation applies to
 * /analysis/eye-upload/{petId}.
 */
function validateEyeUploadRequest({ event }) {
  const { resource, pathParameters } = event;

  // Validate petId path parameter for eye-upload route
  if (resource === "/analysis/eye-upload/{petId}") {
    const petId = pathParameters?.petId;
    if (!petId) {
      return {
        isValid: false,
        error: createErrorResponse(400, "eyeUpload.errors.missingPetId", event),
      };
    }
    if (!mongoose.isValidObjectId(petId)) {
      return {
        isValid: false,
        error: createErrorResponse(400, "eyeUpload.errors.invalidObjectId", event),
      };
    }
  }

  // For POST /analysis/breed — JSON body route
  if (resource === "/analysis/breed") {
    let parsedBody = null;
    if (typeof event.body === "string" && event.body.trim().length > 0) {
      try {
        parsedBody = JSON.parse(event.body);
      } catch {
        return {
          isValid: false,
          error: createErrorResponse(400, "common.invalidJSON", event),
        };
      }
    }
    if (!parsedBody || Object.keys(parsedBody).length === 0) {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.missingParams", event),
      };
    }
    return { isValid: true, body: parsedBody };
  }

  // All other routes are multipart — body parsing happens in services
  return { isValid: true, body: null };
}

module.exports = { validateEyeUploadRequest };
