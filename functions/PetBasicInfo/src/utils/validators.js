/**
 * @fileoverview Stateless validation helpers shared across Lambda routes.
 */

const mongoose = require("mongoose");

/**
 * Validates that a string is a valid Mongoose ObjectId.
 *
 * @param {string} id The string to validate.
 * @returns {boolean} True when the id is a valid ObjectId.
 */
const isValidObjectId = (id) => {
  if (!id || typeof id !== "string") return false;
  return mongoose.isValidObjectId(id);
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
 * Validates that a value is a finite number.
 *
 * @param {*} value The value to validate.
 * @returns {boolean} True when the value is a number and not NaN.
 */
const isValidNumber = (value) => {
  return typeof value === "number" && !isNaN(value);
};

/**
 * Validates that a value is a boolean.
 *
 * @param {*} value The value to validate.
 * @returns {boolean} True when the value is a boolean.
 */
const isValidBoolean = (value) => {
  return typeof value === "boolean";
};

module.exports = {
  isValidObjectId,
  isValidDateFormat,
  isValidImageUrl,
  isValidNumber,
  isValidBoolean,
};
