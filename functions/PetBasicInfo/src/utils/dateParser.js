/**
 * @fileoverview Date parsing utilities.
 */

/**
 * Parses a date string in DD/MM/YYYY format into a JavaScript Date.
 * Also accepts ISO strings and YYYY-MM-DD formats directly.
 *
 * @param {string} dateString The date string to parse.
 * @returns {Date|null} Parsed Date object or null when the input is falsy.
 */
const parseDDMMYYYY = (dateString) => {
  if (!dateString) return null;

  // If it's already an ISO string, use it directly
  if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(dateString);
  }

  // Parse DD/MM/YYYY format
  const [day, month, year] = dateString.split("/");
  if (
    day &&
    month &&
    year &&
    day.length <= 2 &&
    month.length <= 2 &&
    year.length === 4
  ) {
    return new Date(year, month - 1, day);
  }

  // Fallback to original parsing
  return new Date(dateString);
};

module.exports = {
  parseDDMMYYYY,
};
