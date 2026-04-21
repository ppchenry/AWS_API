/**
 * Returns the first Zod issue message or a fallback string.
 *
 * @param {{ issues?: Array<{ message?: string }> } | undefined} error
 * @param {string} [fallback="others.invalidInput"]
 * @returns {string}
 */
function getFirstZodIssueMessage(error, fallback = "others.invalidInput") {
  return (Array.isArray(error?.issues) ? error.issues : [])[0]?.message || fallback;
}

/**
 * Joins all Zod issue messages into a single comma-separated string.
 *
 * @param {{ issues?: Array<{ message?: string }> } | undefined} error
 * @param {string} [fallback="others.invalidInput"]
 * @returns {string}
 */
function getJoinedZodIssueMessages(error, fallback = "others.invalidInput") {
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