const mongoose = require("mongoose");

function isValidObjectId(id) {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

function normalizeCsvValues(value) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parsePositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  isValidObjectId,
  normalizeCsvValues,
  parsePositiveInteger,
  escapeRegex,
};