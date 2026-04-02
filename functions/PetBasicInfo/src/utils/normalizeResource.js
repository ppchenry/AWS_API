function normalizeResource(path, resource, entityId) {
  const fullPath = path || resource || '/';
  const idx = entityId ? fullPath.indexOf(entityId) : -1;
  return idx !== -1 ? (fullPath.substring(idx + entityId.length) || '/') : (resource || '/');
}

module.exports = { normalizeResource };
