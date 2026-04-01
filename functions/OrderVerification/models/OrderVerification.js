import { Schema } from "mongoose";

const orderVerificationSchema = new Schema({
    tagId: {
        type: String,
        required: true
    },
    staffVerification: {
        type: Boolean,
        default: false
    },
    cancelled: {
        type: Boolean,
        default: false,
    },
    contact: {
        type: String
    },
    verifyDate: {
        type: Date
    },
    petName: {
        type: String
    },
    shortUrl: {
        type: String
    },
    masterEmail: {
        type: String
    },
    qrUrl: {
        type: String
    },
    petUrl: {
        type: String
    },
    orderId: {
        type: String
    },
    location: {
        type: String,
        default: null
    },
    petHuman: {
        type: String,
        default: null
    },
    pendingStatus: {
        type: Boolean,
        default: false
    },
    option: {
        type: String,
    },
    type: {
        type: String
    },
    optionSize: {
        type: String
    },
    optionColor: {
        type: String
    },
    price: {
        type: Number,
    },
    discountProof: {
        type: String,  // URL to the uploaded file in S3
    },
},
    { timestamps: true }
);

export default orderVerificationSchema;