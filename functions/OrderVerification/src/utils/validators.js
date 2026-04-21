const mongoose = require("mongoose");

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
}

function normalizePhone(phone) {
  return typeof phone === "string" ? phone.trim() : phone;
}

function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}

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
