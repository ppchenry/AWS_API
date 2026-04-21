function getZodIssues(error) {
  return Array.isArray(error?.issues) ? error.issues : [];
}

function getFirstZodIssueMessage(error, fallback = "others.invalidParams") {
  return getZodIssues(error)[0]?.message || fallback;
}

module.exports = {
  getFirstZodIssueMessage,
};
