const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { createErrorResponse } = require('../utils/response');
const { validateSelfAccess } = require('./selfAccess');

/**
 * Validates user existence for private routes and parses body for all routes.
 * @async
 * @param {Object} request
 * @param {import('aws-lambda').APIGatewayProxyEvent} request.event
 * @returns {Promise<UserValidationResult>}
 */
async function validateUserRequest({ event }) {
  const { body, pathParameters, httpMethod } = event;
  const userId = pathParameters?.userId;
  const method = httpMethod?.toUpperCase();
  const routeKey = `${method} ${event.resource}`;

  // JSON Body Check
  let parsedBody = null;
  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "others.invalidJSON", event)
      };
    }
  }

  // Body Requirement Check (for PUT/POST)
  // In UserRoutes, almost every POST/PUT needs data (Login, Register, Update)
  if ((method === 'PUT' || method === 'POST') && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event)
    };
  }

  const selfAccessResult = await validateSelfAccess({
    event,
    routeKey,
    parsedBody,
    pathUserId: userId,
  });

  if (!selfAccessResult.isValid) {
    return {
      isValid: false,
      error: selfAccessResult.error,
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
      error: createErrorResponse(400, "others.invalidGET", event) 
    };
  }

  // Database Fetch
  const User = mongoose.model("User");
  const user = await User.findOne({ _id: userId, deleted: false }).lean();

  // Existence Check (Matching your 'others' keys)
  if (!user) {
    return { 
      isValid: false, 
      error: createErrorResponse(404, "others.getUserNotFound", event)
    };
  }

  return { isValid: true, body: parsedBody, data: user };
}

module.exports = { validateUserRequest };