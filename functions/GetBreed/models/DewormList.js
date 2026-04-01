const mongoose = require("mongoose");

const dewormSchema = new mongoose.Schema({
  brandName: {
    type: String,
  },
});

module.exports = dewormSchema;
