import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId, // reference to another collection (user)
        },
        type: {
            type: String,
        },
        isArchived: {
            type: Boolean,
            default: false
        },
        // Pet-related (for deworming/vaccination)
        petId: {
            type: mongoose.Schema.Types.ObjectId,
        },
        petName: {
            type: String,
            default: null,
        },
        nextEventDate: {
            type: Date,
            default: null,
        },
        nearbyPetLost: {
            type: String,
            default: null,
        },
    }, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

export default NotificationSchema;