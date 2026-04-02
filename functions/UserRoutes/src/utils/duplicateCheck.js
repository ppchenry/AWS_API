/**
 * @fileoverview Duplicate-detection helper for validating unique fields across
 * Mongoose models before inserts or updates.
 */

/**
 * @typedef {Object} DuplicateCheckField
 * @property {string} model The model key to resolve from the provided models map.
 * @property {string} path The document field path to query.
 * @property {any} value The candidate value to check.
 * @property {string} [label] Human-readable label for conflict reporting.
 * @property {boolean} [skipIfEmpty=true] Whether empty values should skip the check.
 * @property {Record<string, any>} [collation] Optional MongoDB collation for the query.
 */

/**
 * Checks whether any of the provided field values already exist on the target models.
 * Intended for pre-write validation in update and create flows.
 *
 * @async
 * @param {Record<string, any>} models Map of model names to Mongoose models.
 * @param {DuplicateCheckField[]} fields List of field definitions to validate.
 * @param {Record<string, string | string[]>} [excludeIds={}] Model-specific document ids to exclude from duplicate detection.
 * @returns {Promise<{ok: true} | {ok: false, duplicates: Array<{model: string, path: string, label: string, value: any, conflictId: string}>}>} Duplicate check result.
 */
async function checkDuplicates(models, fields, excludeIds = {}) {
  const checks = fields.map(async (f) => {
    const Model = models[f.model];
    if (!Model) throw new Error(`checkDuplicates: unknown model '${f.model}'`);

    const skipIfEmpty = f.skipIfEmpty !== false;
    const v = f.value;

    if (
      skipIfEmpty &&
      (v === undefined || v === null || (typeof v === "string" && v.trim() === ""))
    ) {
      return null;
    }

    const ex = excludeIds[f.model];
    const excludeClause =
      ex == null
        ? {}
        : Array.isArray(ex)
          ? { _id: { $nin: ex } }
          : { _id: { $ne: ex } };

    const filter = {
      [f.path]: v,
      ...excludeClause,
    };

    let query = Model.findOne(filter).select({ _id: 1 }).lean();

    if (f.collation) query = query.collation(f.collation);

    const doc = await query;

    if (!doc) return null;

    return {
      model: f.model,
      path: f.path,
      label: f.label || `${f.model}.${f.path}`,
      value: v,
      conflictId: String(doc._id),
    };
  });

  const results = await Promise.all(checks);
  const duplicates = results.filter(Boolean);

  return duplicates.length ? { ok: false, duplicates } : { ok: true };
}

module.exports = {
  checkDuplicates,
};
