const mongoose = require("mongoose");

const UserBusinessSchema = new mongoose.Schema(
  {
    business_name: {
      type: String,
    },
    access_key: {
      type: String,
    },
    access_secret: {
      type: String,
    },
    token: {
      type: Number,
    },
    model_type: {
      type: String,
    },
  },
  { timestamps: true }
);

UserBusinessSchema.index(
  {
    access_key: 1,
    access_secret: 1,
  },
  { unique: true }
);

module.exports = UserBusinessSchema;