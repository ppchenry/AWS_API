const fs = require("fs");
const path = require("path");

const templateCache = {};

/**
 * Escapes HTML special characters in a string to prevent XSS in email content.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Renders a static HTML email template by replacing {{KEY}} placeholders.
 * Keys suffixed with _HTML are inserted as raw HTML (not escaped).
 * All other values are HTML-escaped before substitution.
 *
 * Template files are read once from disk and cached for the Lambda container lifetime.
 *
 * @param {string} templateName - Filename inside the static/ directory (e.g. "order-confirmation-email.html")
 * @param {Record<string, string>} data - Map of placeholder keys to replacement values
 * @returns {string} Rendered HTML string
 */
function renderTemplate(templateName, data) {
  if (!templateCache[templateName]) {
    const filePath = path.join(__dirname, "..", "..", "static", templateName);
    templateCache[templateName] = fs.readFileSync(filePath, "utf8");
  }

  let html = templateCache[templateName];

  for (const [key, value] of Object.entries(data)) {
    const isRawHtml = key.endsWith("_HTML");
    const replacement = isRawHtml ? (value || "") : escapeHtml(value);
    html = html.split(`{{${key}}}`).join(replacement);
  }

  return html;
}

module.exports = { renderTemplate, escapeHtml };
