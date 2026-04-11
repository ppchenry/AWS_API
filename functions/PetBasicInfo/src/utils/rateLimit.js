const mongoose = require("mongoose");

/**
 * Extracts the client IP address from a Lambda event.
 * Prefers the first entry of `x-forwarded-for` (set by API Gateway) and falls
 * back to the request context source IP when that header is absent.
 *
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 * @returns {string} Client IP, or `"unknown"` when none is resolvable.
 */
function getClientIp(event) {
  const forwardedFor = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return event.requestContext?.identity?.sourceIp || event.requestContext?.http?.sourceIp || "unknown";
}

/**
 * Rounds a Unix timestamp down to the start of the current sliding window.
 *
 * @param {number} nowMs - Current time as a Unix timestamp in milliseconds.
 * @param {number} windowSec - Window length in seconds.
 * @returns {Date} The start of the current window.
 */
function toWindowStart(nowMs, windowSec) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/**
 * Increments the counter for the given action/key/window using an atomic upsert.
 * Returns whether the request is within the allowed quota.
 *
 * @param {Object} params
 * @param {string} params.action - Logical action name, e.g. `"petDelete"`.
 * @param {string} params.key - Composite key, typically `"<ip>:<identifier>"`.
 * @param {number} params.limit - Maximum requests allowed per window.
 * @param {number} params.windowSec - Window length in seconds.
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function consumeRateLimit({ action, key, limit, windowSec }) {
  const RateLimit = mongoose.model("RateLimit");
  const nowMs = Date.now();
  const windowStart = toWindowStart(nowMs, windowSec);
  const expireAt = new Date(windowStart.getTime() + (windowSec * 1000 * 2));

  const entry = await RateLimit.findOneAndUpdate(
    { action, key, windowStart },
    {
      $inc: { count: 1 },
      $setOnInsert: { expireAt },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      lean: true,
    }
  );

  return {
    allowed: entry.count <= limit,
    count: entry.count,
  };
}

/**
 * Public entry point for rate limiting. Derives the composite key from the
 * client IP and the provided identifier, then delegates to `consumeRateLimit`.
 *
 * @param {Object} params
 * @param {import('aws-lambda').APIGatewayProxyEvent} params.event
 * @param {string} params.action - Logical action name, e.g. `"petDelete"`.
 * @param {string} [params.identifier] - Secondary key component, typically a userId.
 * @param {number} params.limit - Maximum requests allowed per window.
 * @param {number} params.windowSec - Window length in seconds.
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function enforceRateLimit({ event, action, identifier, limit, windowSec }) {
  const ip = getClientIp(event);
  const key = `${ip}:${identifier || "anonymous"}`;
  return consumeRateLimit({ action, key, limit, windowSec });
}

module.exports = {
  getClientIp,
  consumeRateLimit,
  enforceRateLimit,
};
