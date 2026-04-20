const fs = require("fs");
const path = require("path");

const SUPPORTED_LANGS = ["en", "zh"];
const FALLBACK_LANG = "en";

/** @type {Record<string, Record<string, any>>} */
const translationCache = {};

/**
 * Loads translations for a supported language from the locales directory.
 * Falls back to English when the requested language is not supported.
 * Results are cached per Lambda container so locale files are read from disk only once.
 *
 * @param {string} [lang="en"] The requested language code.
 * @returns {Record<string, any>} Parsed translation object for the language.
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
 * Resolves a dotted translation key against a translations object.
 * Returns the key itself when no translation is found.
 *
 * @param {Record<string, any>} translations The loaded translations object.
 * @param {string} key The dotted translation key.
 * @returns {string} The translated string or the original key.
 */
const getTranslation = (translations, key) => {
  return (
    key.split(".").reduce((obj, part) => {
      return obj && obj[part] !== undefined ? obj[part] : null;
    }, translations) || key
  );
};

module.exports = {
  loadTranslations,
  getTranslation,
};
