const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const OrderSchema = new Schema(
  {
    lastName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
    },
    address: {
      type: String,
    },
    paymentWay: {
      type: String,
    },
    delivery: {
      type: String,
    },
    tempId: {
      type: String,
    },
    option: {
      type: String,
    },
    type: {
      type: String,
    },
    price: {
      type: Number,
    },
    petImg: {
      type: String,
    },
    promotionCode: {
      type: String,
    },
    shopCode: {
      type: String,
    },
    SPCACode: {
      type: String,
    },
    referrerId: {
      type: String,
    },
    buyDate: {
      type: Date,
    },
    isPTagAir: {
      type: Boolean,
      default: false,
    },
    petName: {
      type: String,
    },
    petContact: {
      type: String,
    },
    sfWayBillNumber: {
      type: String,
    },
    language: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = OrderSchema;
