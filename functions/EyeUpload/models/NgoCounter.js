import mongoose from "mongoose";
const Schema = mongoose.Schema;

const ngoCounterSchema = new Schema({
    ngoId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    counterType: {
        type: Object
    },
    ngoPrefix: {
        type: String
    },
    seq: {
        type: Number
    }
},
{
    timestamps: true,
});

export default ngoCounterSchema