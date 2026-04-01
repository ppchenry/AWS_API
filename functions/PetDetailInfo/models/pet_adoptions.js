const mongoose = require("mongoose");

const petAdoptionSchema = new mongoose.Schema(
    {
        petId: {
            type: mongoose.Schema.Types.ObjectId
        },
        postAdoptionName: { 
            type: String,
            default: null 
        },
        isNeutered: {
            type: Boolean,
            default: null 
        },
        NeuteredDate: { 
            type: Date, default: null
        },
        firstVaccinationDate: { 
            type: Date,
            default: null
        },
        secondVaccinationDate: {
            type: Date,
            default: null
        },
        thirdVaccinationDate: { 
            type: Date,
            default: null
        },
        followUpMonth1: { type: Boolean, default: false },
        followUpMonth2: { type: Boolean, default: false },
        followUpMonth3: { type: Boolean, default: false },
        followUpMonth4: { type: Boolean, default: false },
        followUpMonth5: { type: Boolean, default: false },
        followUpMonth6: { type: Boolean, default: false },
        followUpMonth7: { type: Boolean, default: false },
        followUpMonth8: { type: Boolean, default: false },
        followUpMonth9: { type: Boolean, default: false },
        followUpMonth10: { type: Boolean, default: false },
        followUpMonth11: { type: Boolean, default: false },
        followUpMonth12: { type: Boolean, default: false },
    },
    { timestamps: true }
); // Automatically manages createdAt and updatedAt

module.exports = petAdoptionSchema;
