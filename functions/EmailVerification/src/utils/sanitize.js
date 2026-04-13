/**
 * @fileoverview Response sanitizers for user-shaped data.
 */

/**
 * Removes sensitive fields from a user record before it is returned in an API response.
 * Strips password, internal credit fields, and system flags.
 *
 * @param {Record<string, any> | { toObject: () => Record<string, any> } | null | undefined} user
 * @returns {Record<string, any> | null | undefined}
 */
function sanitizeUser(user) {
  if (!user) {
    return user;
  }

  const rawUser = typeof user.toObject === "function" ? user.toObject() : user;
  const {
    password,
    passwordReset,
    credit,
    vetCredit,
    eyeAnalysisCredit,
    bloodAnalysisCredit,
    ...safeUser
  } = rawUser;
  return safeUser;
}

module.exports = {
  sanitizeUser,
};
