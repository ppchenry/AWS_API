const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const NgoCounterSchema = new Schema(
  {
    ngoId: { type: mongoose.Schema.Types.ObjectId },
    counterType: { type: Object },
    ngoPrefix: { type: String },
    seq: { type: Number },
  },
  { timestamps: true }
);

module.exports = NgoCounterSchema;
