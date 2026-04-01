const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const productSchema = new Schema({
    product_name: {
        type: String
    },
    product_name_eng: {
        type: String
    },
    price: {
        type: String
    },
    rate: {
        type: String
    },
    brand: {
        type: String
    },
    url: {
        type: String
    },
    image: {
        type: String
    }
});

module.exports = productSchema