const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const productLogSchema = new Schema({
    userId: {
        type: String,
        required: true,
    },
    userEmail: {
        type: String,
        required: true
    },
    petId: {
        type: String,
        required: true,
    },
    productUrl: {
        type: String,
        required: true
    },
    accessAt: {
        type: Date
    }

},
{
    timestamps: true,
});

module.exports = productLogSchema