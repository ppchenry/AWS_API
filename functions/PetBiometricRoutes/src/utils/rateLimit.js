const mongoose = require("mongoose");

/**
 * Extracts the most reliable caller IP available from the API Gateway event.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any>} event
 * @returns {string}
 */
function getClientIp(event) {
  const forwardedFor = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return event.requestContext?.identity?.sourceIp || event.requestContext?.http?.sourceIp || "unknown";
}

/**
 * Floors a timestamp into the current rate-limit window bucket.
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
 * Consumes one unit from a rate-limit window using an atomic upsert.
 *
 * @param {{ action: string, key: string, limit: number, windowSec: number, nowMs?: number }} request
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function consumeRateLimit({ action, key, limit, windowSec, nowMs = Date.now() }) {
  const RateLimit = mongoose.model("RateLimit");
  const windowStart = toWindowStart(nowMs, windowSec);
  const expireAt = new Date(windowStart.getTime() + windowSec * 1000);

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
 * Applies an IP-and-identifier-based rate limit for the current request.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent | Record<string, any>, action: string, identifier?: string, limit: number, windowSec: number }} request
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function enforceRateLimit({ event, action, identifier = "anonymous", limit, windowSec }) {
  const clientIp = getClientIp(event);
  return await consumeRateLimit({
    action,
    key: `${clientIp}:${identifier || "anonymous"}`,
    limit,
    windowSec,
  });
}

module.exports = {
  consumeRateLimit,
  enforceRateLimit,
  getClientIp,
  toWindowStart,
};