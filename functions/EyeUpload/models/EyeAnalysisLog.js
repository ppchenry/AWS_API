import mongoose from "mongoose";
const Schema = mongoose.Schema;

const eyeAnalysisLogSchema = new Schema({
    image: {
        type: String
    },
    result: {
        type: Object
    },
    userId: {
        type: String
    },
    petId: {
        type: String
    },
    side: {
        type: String
    },
    heatmap: {
        type: String
    }
},
{
    timestamps: true,
});

export default eyeAnalysisLogSchema