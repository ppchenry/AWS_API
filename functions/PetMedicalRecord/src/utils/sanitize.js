/**
 * Strips internal/sensitive fields from a medical-domain record before response.
 *
 * @param {Record<string, any> | null | undefined} record
 * @returns {Record<string, any> | null | undefined}
 */
function sanitizeRecord(record) {
  if (!record) return record;
  const raw = typeof record.toObject === "function" ? record.toObject() : record;
  const { __v, createdAt, updatedAt, ...safe } = raw;
  return safe;
}

module.exports = {
  sanitizeRecord,
};
