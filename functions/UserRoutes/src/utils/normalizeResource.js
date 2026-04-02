/**
 * Extracts the last meaningful path segment from an API Gateway event,
 * stripping path-parameter placeholders ({userId}, {ngoId}, {proxy+}, etc.)
 * and the base path prefix.
 *
 * Examples:
 *   "/auth/login"                     → "/login"
 *   "/auth/user/{userId}"             → "/user"
 *   "/auth/edit-ngo/{ngoId}"          → "/edit-ngo"
 *   "/auth/register-by-phoneNumber"   → "/register-by-phoneNumber"
 *   "/Dev/auth/pet-placement-options/{ngoId}" → "/pet-placement-options"
 *
 * @param {string} [path]     event.path from API Gateway
 * @param {string} [resource] event.resource template from API Gateway
 * @returns {string} Normalized route suffix (always starts with `/`).
 */
function normalizeResource(path, resource) {
  const raw = resource || path || "/";

  // Remove path-parameter placeholders and their preceding slash
  const cleaned = raw.replace(/\/\{[^}]+\}/g, "");

  // Grab the last segment (e.g. "/auth/login" → "/login")
  const match = cleaned.match(/\/[^/]+$/);
  return match ? match[0] : "/";
}

module.exports = { normalizeResource };
