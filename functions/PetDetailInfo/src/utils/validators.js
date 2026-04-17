const mongoose = require("mongoose");

const normalizeEmail = (email) => {
  if (typeof email !== "string") return email;
  return email.trim().toLowerCase();
};

const normalizePhone = (phoneNumber) => {
  if (typeof phoneNumber !== "string") return phoneNumber;
  return phoneNumber.trim();
};

const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

const isValidPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") return false;
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber.trim());
};

const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== "string") return false;

  // DD/MM/YYYY
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateString.match(ddmmyyyy);
  if (match) {
    const [, day, month, year] = match;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return (
      d.getFullYear() === Number(year) &&
      d.getMonth() === Number(month) - 1 &&
      d.getDate() === Number(day)
    );
  }

  // YYYY-MM-DD with optional ISO-8601 time component (calendar-strict, fully anchored)
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))?)?$/.exec(dateString);
  if (iso) {
    const [, year, month, day, hh, mm, ss, offsetSign, offsetHour, offsetMinute] = iso;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    const dateOk =
      d.getFullYear() === Number(year) &&
      d.getMonth() === Number(month) - 1 &&
      d.getDate() === Number(day);
    if (!dateOk) return false;
    // If time component present, validate ranges
    if (hh !== undefined) {
      if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return false;
      if (
        offsetSign !== undefined &&
        (Number(offsetHour) > 23 || Number(offsetMinute) > 59)
      ) {
        return false;
      }
    }
    return true;
  }

  return false;
};

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
 * Parse date strings that may be in DD/MM/YYYY or ISO format.
 * Returns a Date object or null if input is falsy.
 */
function parseDateFlexible(dateString) {
  if (!dateString) return null;

  // If it's already an ISO string, use it directly
  if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(dateString);
  }

  // Parse DD/MM/YYYY format
  const parts = dateString.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
      return new Date(year, month - 1, day);
    }
  }

  return new Date(dateString);
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  isValidEmail,
  isValidPhoneNumber,
  isValidDateFormat,
  isValidObjectId,
  parseDateFlexible,
};
