const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * One verification record per normalized email, keyed by _id = email.
 * MongoDB guarantees _id uniqueness without any custom index.
 *
 * This is a read-only reference from UserRoutes — the EmailVerification
 * Lambda writes these records. The register endpoint reads consumedAt to
 * confirm the email was recently verified before creating a user account.
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
