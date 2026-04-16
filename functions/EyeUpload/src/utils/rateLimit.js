const mongoose = require("mongoose");
const { logError } = require("./logger");

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

function toWindowStart(nowMs, windowSec) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/**
 * Atomically increment a rate-limit counter for {action, key, windowStart}.
 *
 * Handles the duplicate-key race condition on concurrent upserts by
 * retrying with a plain findOneAndUpdate (no upsert) when E11000 fires.
 * If the Mongo call fails for any other reason, we log the error and
 * default to "allowed" so rate-limit infra failures don't block traffic.
 */
async function consumeRateLimit({ action, key, limit, windowSec }) {
  const RateLimit = mongoose.model("RateLimit");
  const nowMs = Date.now();
  const windowStart = toWindowStart(nowMs, windowSec);
  const expireAt = new Date(windowStart.getTime() + windowSec * 1000 * 2);

  try {
    const entry = await RateLimit.findOneAndUpdate(
      { action, key, windowStart },
      {
        $inc: { count: 1 },
        $setOnInsert: { expireAt },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, lean: true }
    );

    return {
      allowed: entry.count <= limit,
      count: entry.count,
    };
  } catch (err) {
    // E11000 duplicate key — another concurrent request inserted first.
    // Retry without upsert to just increment the existing document.
    if (err.code === 11000) {
      try {
        const entry = await RateLimit.findOneAndUpdate(
          { action, key, windowStart },
          { $inc: { count: 1 } },
          { new: true, lean: true }
        );
        if (entry) {
          return { allowed: entry.count <= limit, count: entry.count };
        }
      } catch (retryErr) {
        logError("Rate limit retry failed", { action, key, error: retryErr });
      }
    } else {
      logError("Rate limit check failed", { action, key, error: err });
    }

    // Default open: don't block requests when rate-limit infra fails
    return { allowed: true, count: 0 };
  }
}

async function enforceRateLimit({
  event,
  action,
  identifier,
  limit,
  windowSec,
}) {
  const ip = getClientIp(event);
  const key = `${ip}:${identifier || "anonymous"}`;
  return consumeRateLimit({ action, key, limit, windowSec });
}

module.exports = { getClientIp, consumeRateLimit, enforceRateLimit };
