/**
 * @fileoverview Rate limiting utility for public/sensitive flows.
 */

const mongoose = require("mongoose");

/**
 * Extracts the client IP from the event.
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {string}
 */
function getClientIp(event) {
  const forwardedFor =
    event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return (
    event.requestContext?.identity?.sourceIp ||
    event.requestContext?.http?.sourceIp ||
    "unknown"
  );
}

/**
 * Floors the current timestamp to the nearest window start.
 * @param {number} nowMs
 * @param {number} windowSec
 * @returns {Date}
 */
function toWindowStart(nowMs, windowSec) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/**
 * Atomic rate-limit counter using findOneAndUpdate + upsert.
 * @param {Object} params
 * @param {string} params.action
 * @param {string} params.key
 * @param {number} params.limit
 * @param {number} params.windowSec
 * @returns {Promise<{allowed: boolean, count: number}>}
 */
async function consumeRateLimit({ action, key, limit, windowSec }) {
  const RateLimit = mongoose.model("RateLimit");
  const nowMs = Date.now();
  const windowStart = toWindowStart(nowMs, windowSec);
  const expireAt = new Date(windowStart.getTime() + windowSec * 1000 * 2);

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
 * High-level rate limit enforcer.
 * @param {Object} params
 * @param {import("aws-lambda").APIGatewayProxyEvent} params.event
 * @param {string} params.action
 * @param {string} [params.identifier]
 * @param {number} params.limit
 * @param {number} params.windowSec
 * @returns {Promise<{allowed: boolean, count: number}>}
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
