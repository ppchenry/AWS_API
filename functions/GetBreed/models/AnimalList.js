const mongoose = require("mongoose");

const animalSchema = new mongoose.Schema({
  animals: {
    en: [
      {
        type: Object,
      },
    ],
    zh: [
      {
        type: Object,
      },
    ],
    cn: [
      {
        type: Object,
      },
    ],
  },
  breeds: {
    type: Object,
  },
});

module.exports = animalSchema;