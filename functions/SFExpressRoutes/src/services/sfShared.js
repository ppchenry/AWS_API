const https = require("https");
const crypto = require("crypto");

const { createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");

function getRateLimitKey(event) {
  return event.userId || event.userEmail || "anonymous";
}

function getConfigError(event, scope, keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length === 0) return null;

  logError("Missing required service configuration", {
    scope,
    event,
    extra: { missing },
  });

  return createErrorResponse(500, "others.internalError", event);
}

function createRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

async function requestJson({ url, method, headers, body }) {
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(raw),
            });
          } catch (_error) {
            reject(new Error("Invalid JSON response"));
          }
        });
      }
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = {
  getRateLimitKey,
  getConfigError,
  createRequestId,
  requestJson,
};