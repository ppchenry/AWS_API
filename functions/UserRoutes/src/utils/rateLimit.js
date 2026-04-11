const mongoose = require("mongoose");

function getClientIp(event) {
  const forwardedFor = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return event.requestContext?.identity?.sourceIp || event.requestContext?.http?.sourceIp || "unknown";
}

function toWindowStart(nowMs, windowSec) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

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