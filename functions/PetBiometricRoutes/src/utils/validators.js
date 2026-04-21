const mongoose = require("mongoose");

/**
 * Normalizes email strings for comparison and lookup.
 *
 * @param {unknown} email
 * @returns {unknown}
 */
function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
}

/**
 * Normalizes phone strings for comparison and lookup.
 *
 * @param {unknown} phone
 * @returns {unknown}
 */
function normalizePhone(phone) {
  return typeof phone === "string" ? phone.trim() : phone;
}

/**
 * Validates a basic email format.
 *
 * @param {unknown} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates an E.164 phone number format.
 *
 * @param {unknown} phone
 * @returns {boolean}
 */
function isValidPhoneNumber(phone) {
  return typeof phone === "string" && /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Validates a MongoDB ObjectId string.
 *
 * @param {unknown} id
 * @returns {boolean}
 */
function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}

/**
 * Validates whether a string is an HTTP or HTTPS image URL candidate.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
function isValidImageUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

/**
 * Validates whether a value can be parsed into a date.
 *
 * @param {unknown} date
 * @returns {boolean}
 */
function isValidDateFormat(date) {
  return !Number.isNaN(Date.parse(date));
}

/**
 * Detects a supported image MIME type from leading file bytes.
 * Returns null when the buffer does not match a known supported image signature.
 *
 * @param {Buffer} buffer
 * @returns {string | null}
 */
function detectImageMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 6 &&
    buffer.subarray(0, 6).toString("ascii") === "GIF87a"
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 6 &&
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a))
  ) {
    return "image/tiff";
  }

  return null;
}

/**
 * Converts an inline JSON file payload into a Buffer when possible.
 * Supports Buffer instances, byte arrays, and base64 strings.
 *
 * @param {unknown} file
 * @returns {Buffer | null}
 */
function getBufferFromInlineFile(file) {
  if (!file || typeof file !== "object") {
    return null;
  }

  const content = file.content;
  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (Array.isArray(content)) {
    return Buffer.from(content);
  }

  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) {
      return Buffer.alloc(0);
    }
    return Buffer.from(trimmed, "base64");
  }

  return null;
}

module.exports = {
  detectImageMimeFromBuffer,
  getBufferFromInlineFile,
  isValidDateFormat,
  isValidEmail,
  isValidImageUrl,
  isValidObjectId,
  isValidPhoneNumber,
  normalizeEmail,
  normalizePhone,
};