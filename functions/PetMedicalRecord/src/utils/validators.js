const mongoose = require("mongoose");

/**
 * Normalizes a date string in DD/MM/YYYY format to a Date object.
 * Also accepts ISO format strings.
 *
 * @param {string} dateString
 * @returns {Date|null}
 */
function parseDDMMYYYY(dateString) {
  if (!dateString) return null;

  if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(dateString);
  }

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

  return new Date(dateString);
}

/**
 * Validates a date string in ISO or DD/MM/YYYY format.
 *
 * @param {string} dateString
 * @returns {boolean}
 */
const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== "string") return false;

  if (
    dateString.includes("T") ||
    dateString.match(
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/
    )
  ) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  if (dateString.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [day, month, year] = dateString.split("/");
    if (
      day &&
      month &&
      year &&
      day.length <= 2 &&
      month.length <= 2 &&
      year.length === 4
    ) {
      const date = new Date(year, month - 1, day);
      return date instanceof Date && !isNaN(date.getTime());
    }
  }

  return false;
};

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

module.exports = {
  parseDDMMYYYY,
  isValidDateFormat,
  isValidObjectId,
};
