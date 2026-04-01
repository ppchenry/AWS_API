const mongoose = require("mongoose");

//const Schema = mongoose.Schema;
// Define the Pet Schema
const PetFacialImageSchema = new mongoose.Schema({
    petId: {
        type: mongoose.Schema.Types.ObjectId, // reference to another collection (user)
        required: true
    },
    FaceImage: {
      FaceFront:{
        type: Array
      },
      FaceLeft:{
        type: Array
      },
      FaceRight:{
        type: Array
      },
      FaceUpper:{
        type: Array
      },
      FaceLower:{
        type: Array
      },
    },
    NoseImage: {
      NoseFront:{
        type: Array
      },
      NoseLeft:{
        type: Array
      },
      NoseRight:{
        type: Array
      },
      NoseUpper:{
        type: Array
      },
      NoseLower:{
        type: Array
      },
    },
    RegisteredFrom: {
      type: String
    }
}, { timestamps: true }); // Automatically manages createdAt and updatedAt


module.exports = PetFacialImageSchema; 