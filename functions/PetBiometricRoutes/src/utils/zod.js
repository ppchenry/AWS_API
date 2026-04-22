/**
 * Returns the first Zod issue message or a fallback string.
 *
 * @param {{ issues?: Array<{ message?: string }> } | undefined} error
 * @param {string} [fallback="common.invalidInput"]
 * @returns {string}
 */
function getFirstZodIssueMessage(error, fallback = "common.invalidInput") {
  return (Array.isArray(error?.issues) ? error.issues : [])[0]?.message || fallback;
}

/**
 * Joins all Zod issue messages into a single comma-separated string.
 *
 * @param {{ issues?: Array<{ message?: string }> } | undefined} error
 * @param {string} [fallback="common.invalidInput"]
 * @returns {string}
 */
function getJoinedZodIssueMessages(error, fallback = "common.invalidInput") {
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  if (issues.length === 0) {
    return fallback;
  }

  return issues.map((issue) => issue.message).join(", ");
}

module.exports = {
  getFirstZodIssueMessage,
  getJoinedZodIssueMessages,
};