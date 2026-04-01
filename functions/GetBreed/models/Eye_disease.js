const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const DiseaseSchema = new Schema(
  {
    eyeDisease_eng: {
      type: String,
      required: true
    },
    eyeDisease_chi: {
      type: String,
      required: true
    },
    eyeDisease_issue: {
      type: String,
      required: true
    },
    eyeDisease_care: {
      type: String,
      required: true
    },
    eyeDisease_issue_en: {
      type: String,
      required: true
    },
    eyeDisease_care_en: {
      type: String,
      required: true
    },
    eyeDisease_medication: {
      type: Array,
    }
  }
);

module.exports = DiseaseSchema
