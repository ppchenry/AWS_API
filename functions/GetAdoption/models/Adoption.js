const mongoose = require("mongoose");


const AdoptionSchema = new mongoose.Schema(
  {
    Name: {
      type: String,
    },
    Age: {
      type: Number,
    },
    Sex: {
      type: String,
    },
    Remarks: {
      type: String,
    },
    Image_Url: {
      type: String,
    },
    URL: {
      type: String,
    },
    AdoptionSite: {
      type: String,
    },
  }
);

module.exports =  AdoptionSchema;
