const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RateLimitSchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true }
);

RateLimitSchema.index({ action: 1, key: 1, windowStart: 1 }, { unique: true });
RateLimitSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = RateLimitSchema;
