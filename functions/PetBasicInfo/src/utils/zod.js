/**
 * @fileoverview Zod error extraction helpers.
 * Zod v4 uses error.issues, not error.errors.
 */

/**
 * Returns the issues array from a Zod error, or an empty array when absent.
 *
 * @param {{ issues?: Array<{ message: string }> } | null | undefined} error
 * @returns {Array<{ message: string }>}
 */
function getZodIssues(error) {
  return Array.isArray(error?.issues) ? error.issues : [];
}

/**
 * Returns the message from the first Zod issue, or a fallback string.
 *
 * @param {{ issues?: Array<{ message: string }> } | null | undefined} error
 * @param {string} [fallback]
 * @returns {string}
 */
function getFirstZodIssueMessage(error, fallback = "Invalid input") {
  return getZodIssues(error)[0]?.message || fallback;
}

/**
 * Returns all Zod issue messages joined by `", "`, or a fallback string when
 * there are no issues.
 *
 * @param {{ issues?: Array<{ message: string }> } | null | undefined} error
 * @param {string} [fallback]
 * @returns {string}
 */
function getJoinedZodIssueMessages(error, fallback = "Invalid input") {
  const issues = getZodIssues(error);

  if (issues.length === 0) {
    return fallback;
  }

  return issues
    .map((issue) => issue?.message)
    .filter(Boolean)
    .join(", ");
}

module.exports = {
  getFirstZodIssueMessage,
  getJoinedZodIssueMessages,
};
