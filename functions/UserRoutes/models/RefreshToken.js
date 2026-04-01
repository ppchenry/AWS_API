const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RefreshTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 } // TTL index to auto-delete expired tokens
    }
  },
  {
    timestamps: false // We're managing createdAt manually
  }
);

// Index for faster queries
RefreshTokenSchema.index({ userId: 1, expiresAt: 1 });

module.exports = RefreshTokenSchema;
