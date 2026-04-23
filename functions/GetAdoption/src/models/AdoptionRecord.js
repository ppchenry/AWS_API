const mongoose = require("mongoose");

const AdoptionRecordSchema = new mongoose.Schema(
  {
    petId: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =  AdoptionRecordSchema;
