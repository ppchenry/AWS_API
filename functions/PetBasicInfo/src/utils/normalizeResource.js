/**
 * Normalizes a request path by extracting the sub-path following a specific entity ID.
 * * This is useful in AWS Lambda handlers to route requests consistently regardless of 
 * how the API Gateway resource or proxy path is structured.
 * * @param {string} path - The raw request path (typically event.path).
 * @param {string} resource - The API Gateway resource path (typically event.resource).
 * @param {string} [entityId] - The unique identifier (e.g., petId or userId) used as a delimiter.
 * @returns {string} The normalized sub-path (e.g., "/health" or "/profile"). Returns "/" if no sub-path is found.
 * * @example
 * // Returns "/medical-records"
 * normalizeResource("/pets/123/medical-records", "/pets/{petId}/medical-records", "123");
 * * @example
 * // Returns "/" (default fallback)
 * normalizeResource(null, "/login", null);
 */
function normalizeResource(path, resource, entityId) {
  const fullPath = path || resource || '/';
  const idx = entityId ? fullPath.indexOf(entityId) : -1;
  return idx !== -1 ? (fullPath.substring(idx + entityId.length) || '/') : (resource || '/');
}

module.exports = { normalizeResource };
