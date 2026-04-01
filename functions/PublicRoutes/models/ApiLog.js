const mongoose = require("mongoose");

//const Schema = mongoose.Schema;
// Define the Pet Schema
const ApiLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  result: {
    type: Object
  },
  error: {
    type: Object
  },
  image_url: {
    type: String
  },
  token: {
    type: Number
  },
  model_type: {
    type: String
  }
}, { timestamps: true });


module.exports = ApiLogSchema; 