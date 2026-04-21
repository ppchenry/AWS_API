const mongoose = require("mongoose");

const RateLimitSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      index: true,
    },
    windowStart: {
      type: Date,
      required: true,
      index: true,
    },
    count: {
      type: Number,
      default: 0,
    },
    expireAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

RateLimitSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
RateLimitSchema.index({ action: 1, key: 1, windowStart: 1 }, { unique: true });

module.exports = RateLimitSchema;