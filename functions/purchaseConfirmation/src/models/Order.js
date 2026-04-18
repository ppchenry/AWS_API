const { Schema } = require("mongoose");

const orderSchema = new Schema(
  {
    isPTagAir: { type: Boolean, required: true },
    lastName: { type: String },
    email: { type: String },
    phoneNumber: { type: String },
    address: { type: String },
    paymentWay: { type: String },
    delivery: { type: String },
    tempId: { type: String, unique: true, sparse: true },
    option: { type: String },
    type: { type: String },
    price: { type: Number, default: 0 },
    petImg: { type: String },
    promotionCode: { type: String },
    shopCode: { type: String },
    buyDate: { type: Date },
    petName: { type: String },
    petContact: { type: String },
    sfWayBillNumber: { type: String },
    language: { type: String },
  },
  { timestamps: true }
);

module.exports = orderSchema;
