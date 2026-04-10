/**
 * @fileoverview Self-access enforcement middleware factory shared across Lambda functions.
 * Compares JWT identity against request identifiers (path param, body userId/email)
 * using a caller-supplied policy map.
 *
 * Usage in each Lambda's middleware/selfAccess.js:
 *
 *   const { createSelfAccessValidator } = require('../../../../shared/middleware/selfAccess');
 *   const { createErrorResponse } = require('../utils/response');
 *
 *   const POLICIES = {
 *     'GET /account/{userId}': 'pathUserId',
 *     'PUT /account': 'bodyUserId',
 *     'POST /account/delete-user-with-email': 'bodyEmail',
 *     // ...
 *   };
 *
 *   const { validateSelfAccess } = createSelfAccessValidator(POLICIES, createErrorResponse);
 *   module.exports = { validateSelfAccess };
 */

const { normalizeEmail } = require("../utils/validators");

/**
 * @typedef {'pathUserId' | 'bodyUserId' | 'bodyEmail'} PolicyType
 */

/**
 * Creates a `validateSelfAccess` function bound to the provided policy map and
 * error response builder.
 *
 * @param {Record<string, PolicyType>} policies Map of `"METHOD /route"` keys to policy types.
 * @param {function(number, string, import("aws-lambda").APIGatewayProxyEvent): any} createErrorResponse The Lambda's own error response builder.
 * @returns {{ validateSelfAccess: (params: { event: import("aws-lambda").APIGatewayProxyEvent & { userId?: string, userEmail?: string }, routeKey: string, parsedBody: Record<string, any> | null, pathUserId: string | undefined }) => { isValid: true } | { isValid: false, error: any } }}
 */
function createSelfAccessValidator(policies, createErrorResponse) {
  function createUnauthorizedResponse(event) {
    return createErrorResponse(403, "others.unauthorized", event);
  }

  /**
   * Compares self-service request identifiers against the decoded JWT identity.
   * Leaves format validation and record existence checks to existing route logic.
   *
   * @param {Object} params
   * @param {import("aws-lambda").APIGatewayProxyEvent & { userId?: string, userEmail?: string }} params.event
   * @param {string} params.routeKey
   * @param {Record<string, any> | null} params.parsedBody
   * @param {string | undefined} params.pathUserId
   * @returns {{ isValid: true } | { isValid: false, error: any }}
   */
  function validateSelfAccess({ event, routeKey, parsedBody, pathUserId }) {
    const policy = policies[routeKey];
    if (!policy) {
      return { isValid: true };
    }

    if (policy === "bodyUserId") {
      const bodyUserId = parsedBody?.userId;

      if (bodyUserId == null) {
        return { isValid: true };
      }

      if (!event.userId || String(event.userId) !== String(bodyUserId)) {
        return { isValid: false, error: createUnauthorizedResponse(event) };
      }

      return { isValid: true };
    }

    if (policy === "bodyEmail") {
      const requestEmail = parsedBody?.email;

      if (requestEmail == null) {
        return { isValid: true };
      }

      if (!event.userEmail || normalizeEmail(event.userEmail) !== normalizeEmail(requestEmail)) {
        return { isValid: false, error: createUnauthorizedResponse(event) };
      }

      return { isValid: true };
    }

    // pathUserId policy
    if (pathUserId != null && (!event.userId || String(event.userId) !== String(pathUserId))) {
      return { isValid: false, error: createUnauthorizedResponse(event) };
    }

    return { isValid: true };
  }

  return { validateSelfAccess };
}

module.exports = { createSelfAccessValidator };
