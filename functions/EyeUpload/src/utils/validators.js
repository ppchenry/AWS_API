const mongoose = require("mongoose");

const isValidObjectId = (id) => mongoose.isValidObjectId(id);

const isValidImageUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
};

function parseDDMMYYYY(dateString) {
  if (!dateString) return null;

  if (dateString.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    return new Date(dateString);
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
    return new Date(year, month - 1, day);
  }

  return new Date(dateString);
}

module.exports = { isValidObjectId, isValidImageUrl, parseDDMMYYYY };
