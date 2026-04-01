/**
 * @fileoverview Translation helpers for loading locale files and resolving
 * nested translation keys.
 */

const fs = require("fs");
const path = require("path");

const SUPPORTED_LANGS = ["en", "zh"];
const FALLBACK_LANG = "en";

/**
 * Loads translations for a supported language from the locales directory.
 * Falls back to English when the requested language is not supported.
 *
 * @param {string} [lang="en"] The requested language code.
 * @returns {Record<string, any>} Parsed translation object for the language.
 */
const loadTranslations = (lang = "en") => {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : FALLBACK_LANG;
  const filePath = path.join(__dirname, "..", "locales", `${safeLang}.json`);
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
};

/**
 * Resolves a dotted translation key against a translations object.
 * Returns the key itself when no translation is found.
 *
 * @param {Record<string, any>} translations The loaded translations object.
 * @param {string} key The dotted translation key, for example `auth.login.failed`.
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
