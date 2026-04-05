const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { createErrorResponse } = require('../utils/response');

/**
 * Validates user existence for private routes and parses body for all routes.
 * @async
 * @param {Object} request
 * @param {import('aws-lambda').APIGatewayProxyEvent} request.event
 * @param {Object} request.translations
 * @returns {Promise<UserValidationResult>}
 */
async function validateUserRequest({ event, translations }) {
  const { body, pathParameters, httpMethod } = event;
  const userId = pathParameters?.userId;
  const method = httpMethod?.toUpperCase();

  // JSON Body Check
  let parsedBody = null;
  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "others.invalidJSON", translations, event)
      };
    }
  }

  // Body Requirement Check (for PUT/POST)
  // In UserRoutes, almost every POST/PUT needs data (Login, Register, Update)
  if ((method === 'PUT' || method === 'POST') && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(
        400, 
        "others.missingParams", // Using your specific locale key
        translations, 
        event
      )
    };
  }

  // Public/Collection Route Bypass (e.g., Login/Register)
  if (!userId) {
    return { isValid: true, body: parsedBody, data: null };
  }

  // ID Format Validation
  if (!isValidObjectId(userId)) {
    return { 
      isValid: false, 
      error: createErrorResponse(400, "others.invalidGET", translations, event) 
    };
  }

  // Database Fetch
  const User = mongoose.model("User");
  const user = await User.findById(userId).lean();

  // Existence & Deletion Check (Matching your 'others' keys)
  if (!user || user.deleted) {
    return { 
      isValid: false, 
      error: createErrorResponse(
        user?.deleted ? 410 : 404,
        user?.deleted ? "others.userDeleted" : "others.getUserNotFound",
        translations, 
        event
      ) 
    };
  }

  return { isValid: true, body: parsedBody, data: user };
}

module.exports = { validateUserRequest };