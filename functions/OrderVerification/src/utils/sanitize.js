function sanitizeOrderVerification(entity) {
  if (!entity) return entity;
  const raw = typeof entity.toObject === "function" ? entity.toObject() : entity;
  const { __v, ...safe } = raw;
  return safe;
}

function sanitizeOrder(entity) {
  if (!entity) return entity;
  const raw = typeof entity.toObject === "function" ? entity.toObject() : entity;
  const { __v, ...safe } = raw;
  return safe;
}

module.exports = {
  sanitizeOrderVerification,
  sanitizeOrder,
};
