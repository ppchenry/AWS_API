const mongoose = require("mongoose");

/**
 * Resolves the client IP from forwarded headers or API Gateway request context.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {string}
 */
function getClientIp(event) {
  const forwardedFor = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return event.requestContext?.identity?.sourceIp || "unknown";
}

/**
 * Floors the current timestamp to the start of the active rate-limit window.
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
 * Consumes a rate-limit token bucket entry for the given action/key pair.
 *
 * @async
 * @param {{ action: string, key: string, limit: number, windowSec: number }} params
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function consumeRateLimit({ action, key, limit, windowSec }) {
  const RateLimitModel = mongoose.model("RateLimit");
  const nowMs = Date.now();
  const windowStart = toWindowStart(nowMs, windowSec);
  const expireAt = new Date(windowStart.getTime() + (windowSec * 1000));

  const entry = await RateLimitModel.findOneAndUpdate(
    {
      action,
      key,
      windowStart,
    },
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
 * Applies the shared rate-limit policy using client IP plus caller identifier.
 *
 * @async
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent, action: string, limit: number, windowSec: number, identifier?: string }} params
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function enforceRateLimit({ event, action, limit, windowSec, identifier = "anonymous" }) {
  const clientIp = getClientIp(event);
  const key = `${clientIp}:${identifier || "anonymous"}`;
  return await consumeRateLimit({ action, key, limit, windowSec });
}

module.exports = {
  enforceRateLimit,
  getClientIp,
  toWindowStart,
};
