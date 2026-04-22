const { createErrorResponse } = require('../utils/response');
const { normalizeEmail } = require('../utils/validators');

const SELF_ACCESS_POLICIES = {
  'GET /account/{userId}': 'pathUserId',
  'DELETE /account/{userId}': 'pathUserId',
  'PUT /account': 'bodyUserId',
  'PUT /account/update-password': 'bodyUserId',
  'POST /account/update-image': 'bodyUserId',
  'POST /account/delete-user-with-email': 'bodyEmail',
};

function createUnauthorizedResponse(event) {
  return createErrorResponse(403, 'common.unauthorized', event);
}

/**
 * Compares self-service request identifiers against the decoded JWT identity.
 * Leaves format validation and record existence checks to existing route logic.
 *
 * @param {Object} request
 * @param {import('aws-lambda').APIGatewayProxyEvent & { userId?: string, userEmail?: string }} request.event
 * @param {string} request.routeKey
 * @param {Record<string, any> | null} request.parsedBody
 * @param {string | undefined} request.pathUserId
 * @returns {{ isValid: true } | { isValid: false, error: ReturnType<typeof createErrorResponse> }}
 */
function validateSelfAccess({ event, routeKey, parsedBody, pathUserId }) {
  const policy = SELF_ACCESS_POLICIES[routeKey];
  if (!policy) {
    return { isValid: true };
  }

  if (policy === 'bodyUserId') {
    const bodyUserId = parsedBody?.userId;

    if (bodyUserId == null) {
      return { isValid: true };
    }

    if (!event.userId || String(event.userId) !== String(bodyUserId)) {
      return { isValid: false, error: createUnauthorizedResponse(event) };
    }

    return { isValid: true };
  }

  if (policy === 'bodyEmail') {
    const requestEmail = parsedBody?.email;

    if (requestEmail == null) {
      return { isValid: true };
    }

    if (!event.userEmail || normalizeEmail(event.userEmail) !== normalizeEmail(requestEmail)) {
      return { isValid: false, error: createUnauthorizedResponse(event) };
    }

    return { isValid: true };
  }

  if (pathUserId != null && (!event.userId || String(event.userId) !== String(pathUserId))) {
    return { isValid: false, error: createUnauthorizedResponse(event) };
  }

  return { isValid: true };
}

module.exports = {
  validateSelfAccess,
};