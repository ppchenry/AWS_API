const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const EyeAnalysisLogSchema = new Schema(
  {
    image: { type: String },
    result: { type: Object },
    userId: { type: String },
    petId: { type: String },
    side: { type: String },
    heatmap: { type: String },
  },
  { timestamps: true }
);

module.exports = EyeAnalysisLogSchema;
