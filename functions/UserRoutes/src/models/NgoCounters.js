const mongoose = require("mongoose");

const NgoCounterSchema = new mongoose.Schema(
    {
        counterType: {
            type: String
        },
        ngoPrefix: {
            type: String
        },
        seq: {
            type: Number,
            default: 0
        },
        ngoId: {
            type: mongoose.Schema.Types.ObjectId
        }
    },
    {
        timestamps: true,
    }
);

module.exports = NgoCounterSchema;