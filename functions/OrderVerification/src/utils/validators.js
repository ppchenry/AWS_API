const mongoose = require("mongoose");

/**
 * @param {unknown} email
 * @returns {unknown}
 */
function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
}

/**
 * @param {unknown} phone
 * @returns {unknown}
 */
function normalizePhone(phone) {
  return typeof phone === "string" ? phone.trim() : phone;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}

/**
 * Parses either ISO-like dates or DD/MM/YYYY date strings.
 *
 * @param {string|Date|number|null|undefined} dateString
 * @returns {Date|null}
 */
function parseDDMMYYYY(dateString) {
  if (!dateString) return null;

  if (typeof dateString !== "string") {
    const dt = new Date(dateString);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (dateString.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    const dt = new Date(dateString);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const [day, month, year] = dateString.split("/");
  if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
    const dt = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(dateString);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  isValidObjectId,
  parseDDMMYYYY,
};
