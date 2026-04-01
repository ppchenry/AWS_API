const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const eyeAnalysisLogSchema = new Schema({
    image: {
        type: String
    },
    result: {
        type: Object
    },
    eyeSide: {
        type: String
    },
    petId: {
        type: String
    }
},
{
    timestamps: true,
});

module.exports = eyeAnalysisLogSchema