const fs = require("fs");
const path = require("path");

const SUPPORTED_LANGS = ["en", "zh"];
const FALLBACK_LANG = "en";
const translationCache = {};

function loadTranslations(lang = "en") {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : FALLBACK_LANG;
  if (translationCache[safeLang]) return translationCache[safeLang];

  const filePath = path.join(__dirname, "..", "locales", `${safeLang}.json`);
  const content = fs.readFileSync(filePath, "utf8");
  translationCache[safeLang] = JSON.parse(content);
  return translationCache[safeLang];
}

function getTranslation(translations, key) {
  return key.split(".").reduce((obj, part) => {
    return obj && obj[part] !== undefined ? obj[part] : null;
  }, translations) || key;
}

module.exports = {
  loadTranslations,
  getTranslation,
};
