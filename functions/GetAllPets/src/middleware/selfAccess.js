const { createErrorResponse } = require("../utils/response");

/**
 * Self-access policies for GetAllPets routes.
 * Maps route keys to the type of identity check required.
 *
 * - "pathUserId": compare JWT userId against path param userId (cheap, pre-DB)
 * - Mutation routes (deletePet, updatePetEye) enforce ownership atomically
 *   inside their own query filters; no pre-DB helper is needed for those.
 */
const SELF_ACCESS_POLICIES = {
  "GET /pets/pet-list/{userId}": "pathUserId",
};

/**
 * Returns a 403 unauthorized error response.
 * @param {object} event - API Gateway event
 * @returns {object} API Gateway error response
 */
function createForbiddenResponse(event) {
  return createErrorResponse(403, "common.unauthorized", event);
}

/**
 * Validates self-access for routes that use path-based identity.
 * Mutation routes enforce ownership atomically in their query filters
 * and do not flow through this function.
 */
function validateSelfAccess({ event, routeKey, pathUserId }) {
  const policy = SELF_ACCESS_POLICIES[routeKey];
  if (!policy) {
    return { isValid: true };
  }

  if (policy === "pathUserId") {
    if (pathUserId != null && (!event.userId || String(event.userId) !== String(pathUserId))) {
      return { isValid: false, error: createForbiddenResponse(event) };
    }
    return { isValid: true };
  }

  return { isValid: true };
}

module.exports = { validateSelfAccess };
