const mongoose = require("mongoose");

function getClientIp(event) {
  const forwardedFor = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return event.requestContext?.identity?.sourceIp || "unknown";
}

function toWindowStart(nowMs, windowSec) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

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
