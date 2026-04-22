const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { createErrorResponse } = require('../utils/response');
const { validateSelfAccess } = require('./selfAccess');

const NGO_ONLY_RESOURCES = new Set([
  '/account/user-list',
  '/account/edit-ngo/{ngoId}',
  '/account/edit-ngo/{ngoId}/pet-placement-options',
]);

/**
 * Parses request bodies, validates self-access, and performs lightweight path validation.
 * @async
 * @param {Object} request
 * @param {import('aws-lambda').APIGatewayProxyEvent} request.event
 * @returns {Promise<{ isValid: boolean, error?: any, body?: Record<string, any> | null }>}
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
        error: createErrorResponse(400, "common.invalidJSON", event)
      };
    }
  }

  // Body Requirement Check (for PUT/POST)
  // In UserRoutes, almost every POST/PUT needs data (Login, Register, Update)
  if ((method === 'PUT' || method === 'POST') && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.missingParams", event)
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

  if (NGO_ONLY_RESOURCES.has(event.resource) && event.userRole !== 'ngo') {
    return {
      isValid: false,
      error: createErrorResponse(403, 'common.unauthorized', event),
    };
  }

  // Public/Collection Route Bypass (e.g., Login/Register)
  if (!userId) {
    return { isValid: true, body: parsedBody };
  }

  // ID Format Validation
  if (!isValidObjectId(userId)) {
    return { 
      isValid: false, 
      error: createErrorResponse(400, "userRoutes.errors.invalidGET", event) 
    };
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validateUserRequest };