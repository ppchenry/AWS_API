function getZodIssues(error) {
  return Array.isArray(error?.issues) ? error.issues : [];
}

function getFirstZodIssueMessage(error, fallback = "others.invalidInput") {
  const message = getZodIssues(error)[0]?.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return fallback;
  }

  return /\s/.test(message) ? fallback : message;
}

function getJoinedZodIssueMessages(error, fallback = "others.invalidInput") {
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
