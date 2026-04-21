const mongoose = require("mongoose");

module.exports = new mongoose.Schema(
  {
    fileName: { type: String, default: "", trim: true },
    url: { type: String, default: "", trim: true },
    fileSize: { type: Number },
    mimeType: { type: String },
    owner: { type: String, default: "user" },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);