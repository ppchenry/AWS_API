/**
 * Copies a safe subset of fields from a source object.
 *
 * @param {Record<string, any>} source
 * @param {string[]} allowedFields
 * @returns {Record<string, any>}
 */
function pickFields(source, allowedFields) {
  return allowedFields.reduce((accumulator, field) => {
    if (source[field] !== undefined) {
      accumulator[field] = source[field];
    }
    return accumulator;
  }, {});
}

/**
 * Sanitizes an order verification document before returning it to clients.
 *
 * @param {Record<string, any>} entity
 * @returns {Record<string, any>|null|undefined}
 */
function sanitizeOrderVerification(entity) {
  if (!entity) return entity;
  const raw = typeof entity.toObject === "function" ? entity.toObject() : entity;

  return pickFields(raw, [
    "_id",
    "tagId",
    "staffVerification",
    "contact",
    "verifyDate",
    "tagCreationDate",
    "petName",
    "shortUrl",
    "masterEmail",
    "qrUrl",
    "petUrl",
    "orderId",
    "location",
    "petHuman",
    "pendingStatus",
    "option",
    "type",
    "optionSize",
    "optionColor",
    "price",
    "createdAt",
    "updatedAt",
  ]);
}

/**
 * Sanitizes an order document before returning it to clients.
 *
 * @param {Record<string, any>} entity
 * @returns {Record<string, any>|null|undefined}
 */
function sanitizeOrder(entity) {
  if (!entity) return entity;
  const raw = typeof entity.toObject === "function" ? entity.toObject() : entity;

  return pickFields(raw, [
    "_id",
    "tempId",
    "lastName",
    "phoneNumber",
    "petContact",
    "sfWayBillNumber",
    "language",
  ]);
}

module.exports = {
  sanitizeOrderVerification,
  sanitizeOrder,
};
