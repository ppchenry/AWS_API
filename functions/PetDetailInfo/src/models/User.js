const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    image: { type: String, default: "" },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    password: { type: String },
    role: { type: String, required: true, default: "user" },
    verified: { type: Boolean, required: true, default: false },
    passwordReset: {
      resetCode: { type: Number, default: null },
      resetCodeExpiry: { type: Date, default: null },
    },
    subscribe: { type: Boolean, required: true, default: false },
    promotion: { type: Boolean, default: false },
    district: { type: String, default: "" },
    birthday: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    credit: { type: Number, default: 0 },
    vetCredit: { type: Number, default: 0 },
    eyeAnalysisCredit: { type: Number, default: 0 },
    bloodAnalysisCredit: { type: Number, default: 0 },
    phoneNumber: { type: String, default: "" },
    gender: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = UserSchema;
