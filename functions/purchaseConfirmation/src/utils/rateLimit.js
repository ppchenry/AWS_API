const mongoose = require("mongoose");
const { logError } = require("./logger");

/**
 * Reads the client IP address from the request event.
 * Prefers X-Forwarded-For (first IP), falls back to requestContext identity.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {string}
 */
function getClientIp(event) {
  const forwarded = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return event.requestContext?.identity?.sourceIp || "unknown";
}

/**
 * Floors a timestamp to the nearest window boundary.
 *
 * @param {number} nowMs
 * @param {number} windowSec
 * @returns {Date}
 */
function toWindowStart(nowMs, windowSec) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/**
 * Checks and increments the rate limit counter for a given action + key.
 * Uses MongoDB as the backing store with a TTL index on expireAt.
 *
 * @param {{ event: object, action: string, identifier: string, limit: number, windowSec: number }} opts
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function consumeRateLimit({ action, identifier, limit, windowSec }) {
  const RateLimit = mongoose.model("RateLimit");
  const now = Date.now();
  const windowStart = toWindowStart(now, windowSec);
  const expireAt = new Date(windowStart.getTime() + windowSec * 1000);
  const key = identifier;

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

  return { allowed: entry.count <= limit, count: entry.count };
}

/**
 * Enforces a rate limit and returns a result object.
 * The DB connection must be established before calling this.
 *
 * @param {{ event: object, action: string, limit: number, windowSec: number }} opts
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function enforceRateLimit({ event, action, limit, windowSec }) {
  try {
    const clientIp = getClientIp(event);
    return await consumeRateLimit({ action, identifier: `${clientIp}:${action}`, limit, windowSec });
  } catch (error) {
    logError("Rate limit check failed, blocking request", {
      scope: "utils.rateLimit.enforceRateLimit",
      event,
      error,
    });
    return { allowed: false, count: 0 };
  }
}

module.exports = { enforceRateLimit, getClientIp };
