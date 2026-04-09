/**
 * @fileoverview Object transformation helpers used by partial update flows.
 */

/**
 * Flattens a nested object into dot notation suitable for MongoDB `$set` updates.
 * Undefined values are skipped while null, false, zero, and empty strings are preserved.
 *
 * @param {Record<string, any>} obj The object to flatten.
 * @param {string} [prefix=""] Current dot-path prefix used during recursion.
 * @param {Record<string, any>} [out={}] Accumulator object for recursive calls.
 * @returns {Record<string, any>} Flattened object keyed by dot-paths.
 */
function flattenToDot(obj, prefix = "", out = {}) {
  if (!obj || typeof obj !== "object") return out;

  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;

    const dotPath = prefix ? `${prefix}.${k}` : k;

    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date)
    ) {
      flattenToDot(v, dotPath, out);
    } else {
      out[dotPath] = v;
    }
  }
  return out;
}

/**
 * Filters a flattened dot-path map to only the paths allowed by the caller.
 *
 * @param {Record<string, any>} dotMap Flattened dot-path map.
 * @param {Set<string>} allowedPaths Set of allowed dot-path keys.
 * @returns {Record<string, any>} Filtered map containing only allowed paths.
 */
function pickAllowed(dotMap, allowedPaths) {
  const out = {};
  for (const [path, value] of Object.entries(dotMap)) {
    if (allowedPaths.has(path)) out[path] = value;
  }
  return out;
}

/**
 * Checks whether an object contains at least one own enumerable key.
 *
 * @param {Record<string, any> | null | undefined} obj The object to inspect.
 * @returns {boolean} True when the object has keys; otherwise false.
 */
function hasKeys(obj) {
  return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

module.exports = {
  flattenToDot,
  pickAllowed,
  hasKeys,
};
