const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ShopInfoSchema = new Schema({
  shopCode: {
    type: String,
    required: true,
  },
  shopName: {
    type: String,
    required: true,
  },
  shopAddress: {
    type: String,
    required: true,
  },
  shopContact: {
    type: String,
    required: true,
  },
  shopContactPerson: {
    type: String,
    required: true,
  },
  businessReg: {
    type: String,
  },
  price: {
    type: Number,
    required: true,
  },
  bankName: {
    type: String,
  },
  bankNumber: {
    type: String,
  },
});

module.exports = ShopInfoSchema;
