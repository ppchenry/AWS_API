import mongoose from "mongoose";

const { Schema } = mongoose;

const GPTHistorySchema = new Schema(
  {
    userId: String,
    petId: { type: String, default: null },
    completed: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    problem: String,
    previous: [
      {
        question: Object,
        answers: Object,
        userAnswers: [],
      },
    ],
    GPT: [
      {
        GPTPrompt: { type: String, default: "" },
        GPTAnswer: { type: String, default: "" },
      },
    ],
    finish: [
      {
        question: Object,
        answers: Object,
        userAnswers: [],
      },
    ],
    finishGPT: {
      GPTPrompt: { type: String, default: "" },
      GPTAnswer: { type: String, default: "" },
    },
    questionType: { 
      type: String 
    },
  },
  { timestamps: true }
);

export default GPTHistorySchema;