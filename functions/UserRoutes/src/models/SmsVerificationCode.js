const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * One verification record per normalized phone number, keyed by _id = phoneNumber.
 * MongoDB guarantees _id uniqueness without any custom index.
 *
 * After Twilio approves the SMS code, a record is upserted here as proof
 * of verification. The register endpoint checks consumedAt to confirm the
 * phone was recently verified before creating a user account.
 */
const SmsVerificationCodeSchema = new Schema(
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

module.exports = SmsVerificationCodeSchema;
