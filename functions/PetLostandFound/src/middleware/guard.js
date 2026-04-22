const { isValidObjectId } = require("../utils/validators");
const { createErrorResponse } = require("../utils/response");

/**
 * Routes that use multipart form data — skip JSON parsing for these.
 */
const MULTIPART_RESOURCES = new Set([
  "/pets/pet-lost",
  "/pets/pet-found",
]);

/**
 * Resources that require self-access (userId in path must match JWT userId).
 */
const SELF_ACCESS_RESOURCES = new Set([
  "/v2/account/{userId}/notifications",
  "/v2/account/{userId}/notifications/{notificationId}",
]);

/**
 * Parses request bodies, validates path params, and checks self-access.
 *
 * @param {{ event: Record<string, any> }} params
 * @returns {Promise<{ isValid: boolean, error?: any, body?: Record<string, any>|null }>}
 */
async function validateRequest({ event }) {
  const { body, pathParameters, httpMethod } = event;
  const method = httpMethod?.toUpperCase();
  const isMultipart = MULTIPART_RESOURCES.has(event.resource) && (method === "POST");

  // --- JSON Body Parse (skip for multipart routes) ---
  let parsedBody = null;
  if (!isMultipart && typeof body === "string" && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.invalidJSON", event),
      };
    }
  }

  // --- Empty Body Check (skip for multipart and GET/DELETE) ---
  if (
    !isMultipart &&
    (method === "PUT" || method === "POST") &&
    (!parsedBody || Object.keys(parsedBody).length === 0)
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.missingParams", event),
    };
  }

  // --- Self-Access Check (notifications: JWT userId vs path userId) ---
  if (SELF_ACCESS_RESOURCES.has(event.resource)) {
    const pathUserId = pathParameters?.userId;
    if (pathUserId && event.userId && event.userId !== pathUserId) {
      return {
        isValid: false,
        error: createErrorResponse(403, "common.selfAccessDenied", event),
      };
    }
  }

  // --- Path Parameter Validation ---
  const userId = pathParameters?.userId;
  if (userId && !isValidObjectId(userId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.invalidPathParam", event),
    };
  }

  const petLostID = pathParameters?.petLostID;
  if (petLostID && !isValidObjectId(petLostID)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.invalidPathParam", event),
    };
  }

  const petFoundID = pathParameters?.petFoundID;
  if (petFoundID && !isValidObjectId(petFoundID)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.invalidPathParam", event),
    };
  }

  const notificationId = pathParameters?.notificationId;
  if (notificationId && !isValidObjectId(notificationId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.invalidPathParam", event),
    };
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validateRequest };
