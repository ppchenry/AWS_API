const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { createErrorResponse } = require('../utils/response');

/**
 * Validates the incoming request without touching the database. Parses the body,
 * enforces basic mutation rules, and validates the petID format.
 *
 * @async
 * @param {Object} params
 * @param {import('aws-lambda').APIGatewayProxyEvent} params.event
 * @returns {Promise<
 *   { isValid: true, body: Object|null } |
 *   { isValid: false, error: import('aws-lambda').APIGatewayProxyResult }
 * >}
 */
async function validateRequest({ event }) {
  const { body, pathParameters, httpMethod } = event;
  const petID = pathParameters?.petID;
  const method = httpMethod?.toUpperCase();

  // 1. Parse body
  let parsedBody = null;
  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "petBasicInfo.errors.invalidJSON", event),
      };
    }
  }

  // 2. Require body for mutations
  if ((method === 'PUT' || method === 'POST') && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petBasicInfo.errors.emptyUpdateBody", event),
    };
  }

  // 3. Validate petID format
  if (!petID || !isValidObjectId(petID)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "petBasicInfo.errors.invalidPetIdFormat", event),
    };
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validateRequest };