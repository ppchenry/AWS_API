/**
 * @fileoverview Stateless validation helpers and normalizers for EmailVerification.
 */

const mongoose = require("mongoose");

/**
 * Normalizes an email address for consistent comparisons and lookups.
 * @param {unknown} email
 * @returns {string | undefined}
 */
const normalizeEmail = (email) => {
  if (typeof email !== "string") return email;
  return email.trim().toLowerCase();
};

/**
 * Validates an email address using a basic format check.
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validates a 6-digit reset code.
 * @param {string} code
 * @returns {boolean}
 */
const isValidResetCode = (code) => {
  if (!code || typeof code !== "string") return false;
  const codeRegex = /^\d{6}$/;
  return codeRegex.test(code.trim());
};

/**
 * Validates a MongoDB ObjectId.
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
  normalizeEmail,
  isValidEmail,
  isValidResetCode,
  isValidObjectId,
};
