const fs = require("fs");
const path = require("path");

const SUPPORTED_LANGS = ["en", "zh"];
const FALLBACK_LANG = "en";

/** @type {Record<string, Record<string, any>>} */
const translationCache = {};

/**
 * Loads and caches a translation file for the given language.
 * @param {string} [lang='en'] - Language code ('en' or 'zh')
 * @returns {Record<string, any>} Parsed translation object
 */
const loadTranslations = (lang = "en") => {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : FALLBACK_LANG;
  if (translationCache[safeLang]) return translationCache[safeLang];
  const filePath = path.join(__dirname, "..", "locales", `${safeLang}.json`);
  const content = fs.readFileSync(filePath, "utf8");
  translationCache[safeLang] = JSON.parse(content);
  return translationCache[safeLang];
};

/**
 * Resolves a dot-separated key against a translations object.
 * @param {Record<string, any>} translations - Loaded translations
 * @param {string} key - Dot-separated translation key (e.g. 'others.unauthorized')
 * @returns {string} Translated string, or the key itself if not found
 */
const getTranslation = (translations, key) => {
  return (
    key.split(".").reduce((obj, part) => {
      return obj && obj[part] !== undefined ? obj[part] : null;
    }, translations) || key
  );
};

module.exports = { loadTranslations, getTranslation };
