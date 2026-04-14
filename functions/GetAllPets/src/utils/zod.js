/**
 * Extracts the issues array from a Zod error object.
 * @param {object} error - Zod error (from safeParse)
 * @returns {Array<object>} Array of Zod issue objects
 */
function getZodIssues(error) {
  return Array.isArray(error?.issues) ? error.issues : [];
}

/**
 * Returns the message from the first Zod issue, or a fallback string.
 * @param {object} error - Zod error
 * @param {string} [fallback='Invalid input'] - Fallback if no issues exist
 * @returns {string}
 */
function getFirstZodIssueMessage(error, fallback = "Invalid input") {
  return getZodIssues(error)[0]?.message || fallback;
}

/**
 * Joins all Zod issue messages into a comma-separated string.
 * @param {object} error - Zod error
 * @param {string} [fallback='Invalid input'] - Fallback if no issues exist
 * @returns {string}
 */
function getJoinedZodIssueMessages(error, fallback = "Invalid input") {
  const issues = getZodIssues(error);
  if (issues.length === 0) return fallback;
  return issues
    .map((issue) => issue?.message)
    .filter(Boolean)
    .join(", ");
}

module.exports = { getFirstZodIssueMessage, getJoinedZodIssueMessages };
