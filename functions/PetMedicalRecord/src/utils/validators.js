const mongoose = require("mongoose");

function parseIsoDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const isoDate = new Date(dateString);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

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
    return parseIsoDate(dateString);
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
    const normalizedDay = Number(day);
    const normalizedMonth = Number(month);
    const normalizedYear = Number(year);
    const date = new Date(normalizedYear, normalizedMonth - 1, normalizedDay);
    if (
      date.getFullYear() !== normalizedYear ||
      date.getMonth() !== normalizedMonth - 1 ||
      date.getDate() !== normalizedDay
    ) {
      return null;
    }
    return date;
  }

  const fallbackDate = new Date(dateString);
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
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
    const date = parseIsoDate(dateString);
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
      const normalizedDay = Number(day);
      const normalizedMonth = Number(month);
      const normalizedYear = Number(year);
      const date = new Date(normalizedYear, normalizedMonth - 1, normalizedDay);
      return (
        date instanceof Date &&
        !isNaN(date.getTime()) &&
        date.getFullYear() === normalizedYear &&
        date.getMonth() === normalizedMonth - 1 &&
        date.getDate() === normalizedDay
      );
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
