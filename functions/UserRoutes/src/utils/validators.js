/**
 * @fileoverview Stateless validation helpers shared across Lambda routes.
 */

const mongoose = require("mongoose");

/**
 * Normalizes an email address for consistent comparisons and lookups.
 *
 * @param {unknown} email The email value to normalize.
 * @returns {string | undefined} Lowercased, trimmed email string, or the original undefined value.
 */
const normalizeEmail = (email) => {
  if (typeof email !== "string") return email;
  return email.trim().toLowerCase();
};

/**
 * Normalizes a phone number for consistent comparisons and lookups.
 *
 * @param {unknown} phoneNumber The phone value to normalize.
 * @returns {string | undefined} Trimmed phone string, or the original undefined value.
 */
const normalizePhone = (phoneNumber) => {
  if (typeof phoneNumber !== "string") return phoneNumber;
  return phoneNumber.trim();
};

/**
 * Validates an email address using a basic format check.
 *
 * @param {string} email The email address to validate.
 * @returns {boolean} True when the email format is valid.
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validates an E.164-style phone number.
 *
 * @param {string} phoneNumber The phone number to validate.
 * @returns {boolean} True when the phone number format is valid.
 */
const isValidPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") return false;
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber.trim());
};

/**
 * Validates that a string can be parsed into a valid JavaScript date.
 *
 * @param {string} dateString The date string to validate.
 * @returns {boolean} True when the date string parses to a valid date.
 */
const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== "string") return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

/**
 * Validates that a string is a valid HTTP or HTTPS URL.
 *
 * @param {string} url The image URL to validate.
 * @returns {boolean} True when the URL uses the HTTP or HTTPS protocol.
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

/**
 * Validates a MongoDB ObjectId (hex string, ObjectId instance, or other value Mongoose accepts).
 *
 * @param {unknown} id The value to validate.
 * @returns {boolean} True when the value is a valid ObjectId per Mongoose.
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
  normalizePhone,
  isValidEmail,
  isValidPhoneNumber,
  isValidDateFormat,
  isValidImageUrl,
  isValidObjectId,
};
