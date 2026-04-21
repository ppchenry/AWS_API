const mongoose = require("mongoose");

const isValidObjectId = (id) => mongoose.isValidObjectId(id);

function isValidDateFormat(dateString) {
  if (!dateString || typeof dateString !== "string") {
    return false;
  }

  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(dateString)) {
    const date = new Date(dateString);
    return !Number.isNaN(date.getTime());
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
    const [day, month, year] = dateString.split("/");
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return !Number.isNaN(date.getTime());
  }

  return false;
}

function isValidImageUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const urlObject = new URL(url);
    return urlObject.protocol === "http:" || urlObject.protocol === "https:";
  } catch {
    return false;
  }
}

function parseDDMMYYYY(dateString) {
  if (!dateString) {
    return null;
  }

  if (dateString.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    return new Date(dateString);
  }

  const [day, month, year] = dateString.split("/");
  if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(dateString);
}

module.exports = {
  isValidObjectId,
  isValidDateFormat,
  isValidImageUrl,
  parseDDMMYYYY,
};