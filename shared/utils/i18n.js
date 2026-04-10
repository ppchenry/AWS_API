/**
 * @fileoverview Translation helpers for loading locale files and resolving
 * nested translation keys.
 *
 * NOTE: Each Lambda must have its own locales/ directory. This helper resolves
 * locale files relative to __dirname at call time using the callerLocalesDir
 * option, or falls back to a locales/ folder next to this file for Lambdas
 * that colocate their locales with the shared layer.
 *
 * Typical usage — pass __dirname from the Lambda's own i18n wrapper or
 * call loadTranslations with a localesDir override:
 *
 *   const { loadTranslations } = require('../../shared/utils/i18n');
 *   const t = loadTranslations('zh', path.join(__dirname, '..', 'locales'));
 */

const fs = require("fs");
const path = require("path");

const SUPPORTED_LANGS = ["en", "zh"];
const FALLBACK_LANG = "en";

/** @type {Record<string, Record<string, any>>} */
const translationCache = {};

/**
 * Loads translations for a supported language.
 * Falls back to English when the requested language is not supported.
 * Results are cached per (lang + localesDir) pair so locale files are read
 * from disk only once per Lambda container.
 *
 * @param {string} [lang="en"] The requested language code.
 * @param {string} [localesDir] Absolute path to the locales directory. Defaults to a `locales/` folder next to this file.
 * @returns {Record<string, any>} Parsed translation object for the language.
 */
const loadTranslations = (lang = "en", localesDir) => {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : FALLBACK_LANG;
  const dir = localesDir || path.join(__dirname, "..", "locales");
  const cacheKey = `${dir}::${safeLang}`;

  if (translationCache[cacheKey]) return translationCache[cacheKey];

  const filePath = path.join(dir, `${safeLang}.json`);
  const content = fs.readFileSync(filePath, "utf8");
  translationCache[cacheKey] = JSON.parse(content);
  return translationCache[cacheKey];
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
