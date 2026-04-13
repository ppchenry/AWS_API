const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RateLimitSchema = new Schema({
  action: {
    type: String,
    required: true,
  },
  key: {
    type: String,
    required: true,
  },
  windowStart: {
    type: Date,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
  },
  expireAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 },
  },
});

RateLimitSchema.index({ action: 1, key: 1, windowStart: 1 }, { unique: true });

module.exports = RateLimitSchema;
