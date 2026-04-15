const mongoose = require("mongoose");

/**
 * Normalizes a date string in DD/MM/YYYY format to a Date object.
 * Also accepts ISO strings and YYYY-MM-DD formats.
 *
 * @param {string|null|undefined} dateString
 * @returns {Date|null}
 */
function parseDDMMYYYY(dateString) {
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
}

/**
 * Validates a MongoDB ObjectId.
 *
 * @param {unknown} id
 * @returns {boolean}
 */
const isValidObjectId = (id) => {
  if (id == null || id === "") return false;
  if (typeof id === "string") {
    const s = id.trim();
    if (!s) return false;
    return mongoose.isValidObjectId(s);
  }
  return mongoose.isValidObjectId(id);
};

/**
 * Validates that a string can be parsed into a valid date.
 *
 * @param {string} dateString
 * @returns {boolean}
 */
const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== "string") return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

/**
 * Validates that a string is a valid HTTP or HTTPS URL.
 *
 * @param {string} url
 * @returns {boolean}
 */
const isValidImageUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
};

module.exports = {
  parseDDMMYYYY,
  isValidObjectId,
  isValidDateFormat,
  isValidImageUrl,
};
