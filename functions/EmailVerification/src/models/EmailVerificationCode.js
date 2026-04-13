const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * One verification record per normalized email, keyed by _id = email.
 * MongoDB guarantees _id uniqueness without any custom index, so the
 * "at most one record per email" invariant holds regardless of infra
 * index configuration.
 *
 * Generate overwrites the record (codeHash, expiresAt, consumedAt: null).
 * Verify atomically sets consumedAt if codeHash matches and record is
 * unconsumed and unexpired.
 */
const EmailVerificationCodeSchema = new Schema(
  {
    _id: {
      type: String,
    },
    codeHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = EmailVerificationCodeSchema;
