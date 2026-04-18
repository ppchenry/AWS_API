const { Schema } = require("mongoose");

const shopInfoSchema = new Schema(
  {
    shopCode: { type: String, trim: true },
    shopName: { type: String, trim: true },
    shopAddress: { type: String, trim: true },
    shopContact: { type: String, trim: true },
    shopContactPerson: { type: String, trim: true },
    price: { type: Number, default: 0 },
    bankName: { type: String, trim: true },
    bankNumber: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = shopInfoSchema;
