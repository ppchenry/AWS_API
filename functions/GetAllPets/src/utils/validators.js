const mongoose = require("mongoose");

/**
 * Trims and lowercases an email string.
 * @param {string} email - Raw email
 * @returns {string} Normalised email, or the original value if not a string
 */
const normalizeEmail = (email) => {
  if (typeof email !== "string") return email;
  return email.trim().toLowerCase();
};

/**
 * Trims a phone number string.
 * @param {string} phoneNumber - Raw phone number
 * @returns {string} Trimmed phone number, or the original value if not a string
 */
const normalizePhone = (phoneNumber) => {
  if (typeof phoneNumber !== "string") return phoneNumber;
  return phoneNumber.trim();
};

/**
 * Tests whether a string is a valid email address.
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Tests whether a string matches E.164 phone format.
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean}
 */
const isValidPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") return false;
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber.trim());
};

/**
 * Tests whether a string can be parsed into a valid Date.
 * @param {string} dateString - Date string to validate
 * @returns {boolean}
 */
const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== "string") return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

/**
 * Tests whether a string is a valid HTTP or HTTPS URL.
 * @param {string} url - URL to validate
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

/**
 * Tests whether a value is a valid MongoDB ObjectId.
 * @param {string|any} id - Value to validate
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
 * Escapes special regex characters in a string for safe use in RegExp.
 * @param {string} value - Raw string
 * @returns {string} Escaped string
 */
const escapeRegex = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

module.exports = {
  normalizeEmail,
  normalizePhone,
  isValidEmail,
  isValidPhoneNumber,
  isValidDateFormat,
  isValidImageUrl,
  isValidObjectId,
  escapeRegex,
};
