/**
 * @fileoverview Response sanitizers for user-shaped data.
 */

/**
 * Removes sensitive fields from a user record before it is returned in an API response.
 * Accepts either a plain object or a Mongoose document and preserves falsy passthrough
 * so callers can safely use it on optional lookup results.
 *
 * @param {Record<string, any> | { toObject: () => Record<string, any> } | null | undefined} user The user value to sanitize.
 * @returns {Record<string, any> | null | undefined} The sanitized user object with `password` removed, or the original nullish value.
 */
function sanitizeUser(user) {
  if (!user) {
    return user;
  }

  const rawUser = typeof user.toObject === "function" ? user.toObject() : user;
  const { password, ...safeUser } = rawUser;
  return safeUser;
}

module.exports = {
  sanitizeUser,
};