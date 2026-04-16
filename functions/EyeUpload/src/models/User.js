const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    image: { type: String, default: "" },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String },
    role: { type: String, required: true, default: "user" },
    verified: { type: Boolean, required: true, default: false },
    passwordReset: {
      resetCode: { type: Number, default: null },
      resetCodeExpiry: { type: Date, default: null },
    },
    subscribe: { type: Boolean, required: true, default: false },
    promotion: { type: Boolean, required: true, default: false },
    district: { type: String, default: null },
    birthday: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    credit: { type: Number },
    vetCredit: { type: Number },
    eyeAnalysisCredit: { type: Number },
    bloodAnalysisCredit: { type: Number },
    phoneNumber: { type: String },
  },
  { timestamps: true }
);

module.exports = UserSchema;
