const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const OrderVerificationSchema = new Schema(
  {
    tagId: {
      type: String,
      required: true,
    },
    staffVerification: {
      type: Boolean,
      default: false,
    },
    cancelled: {
      type: Boolean,
      default: false,
    },
    contact: {
      type: String,
    },
    verifyDate: {
      type: Date,
    },
    tagCreationDate: {
      type: Date,
    },
    petName: {
      type: String,
    },
    shortUrl: {
      type: String,
    },
    masterEmail: {
      type: String,
    },
    qrUrl: {
      type: String,
    },
    petUrl: {
      type: String,
    },
    orderId: {
      type: String,
    },
    location: {
      type: String,
    },
    petHuman: {
      type: String,
    },
    pendingStatus: {
      type: Boolean,
      default: false
    },
    option: {
      type: String,
    },
    type: {
      type: String
    },
    optionSize: {
      type: String
    },
    optionColor: {
      type: String
    },
    price: {
      type: Number,
    },
    discountProof: {
      type: String,  // URL to the uploaded file in S3
    },
  },
  { timestamps: true }
);

module.exports = OrderVerificationSchema;
