import mongoose from "mongoose";
import { GoogleGenAI } from '@google/genai';
import pkg from "pdf.js-extract";
import officeParser from "officeparser";
import { parse } from "lambda-multipart-parser";
import { DetectDocumentTextCommand } from "@aws-sdk/client-textract"; 
import textractClient from './config/awsBucketConfig.js' // ES Modules import
const { PDFExtract } = pkg;

import GPTHistorySchema from './models/GPTHistory.js';

const ObjectId = mongoose.Types.ObjectId; 
const pdfExtract = new PDFExtract();


const API_KEYS = [
  process.env.GEMINI_KEY_1,
  process.env.GEMINI_KEY_2,
  process.env.GEMINI_KEY_3,
];

let currentKeyIndex = 0;

function extractPdfText(fileBuffer) {
  return new Promise((resolve, reject) => {
    const pdfExtract = new PDFExtract();
    const options = {}; // empty or custom options

    pdfExtract.extractBuffer(fileBuffer, options, (err, data) => {
      if (err) return reject(err);

      // extract text from all pages
      const text = data.pages
        .map(page =>
          page.content.map(item => item.str).join(" ")
        )
        .join("\n");
      
      console.log("TEXT FROM PDF EXTRACT: ", text);
      resolve(text);
    });
  });
}

function extractLinesFromTextract(response) {
  const full_text = response.Blocks
    .filter(block => block.BlockType === "LINE")
    .map(block => block.Text)
    .join("\n");

  return full_text;
}

async function extractTextFromImg(fileBuffer) {
  const input = {
    Document: {
      Bytes: fileBuffer
    }
  }
  const command = new DetectDocumentTextCommand(input);
  const response = await textractClient.send(command);
  const result = extractLinesFromTextract(response);
  return result;
}




function getClient() {
  const key = API_KEYS[currentKeyIndex];
  if (!key) throw new Error("No API key available.");
  return new GoogleGenAI({apiKey: key});
}

function isQuotaError(err) {
  const msg = err?.message?.toLowerCase() || "";
  return (
    msg.includes("quota") ||
    msg.includes("exceeded") ||
    msg.includes("billing") ||
    msg.includes("invalid api key") ||
    msg.includes("permission denied")
  );
}

async function generateWithRotation(prompt) {
  let attempt = 0;

  while (attempt < API_KEYS.length) {
    try {
      const genAI = getClient();
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      return response.text;
    } catch (err) {
      currentKeyIndex++;
      attempt++;
    }
  }

  throw new Error("All API keys exhausted or invalid.");
}


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});
mongoose.connection.on("connected", () => {
  console.log("✅ Mongoose event: connected");
});
mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose event: disconnected");
});

const connectToMongoDB = async () => {
  try {
    if (conn == null) {
      console.log("MongoDB not connected");
      conn = await mongoose.connect(process.env.MONGODB_URI,{
        serverSelectionTimeoutMS: 5000,
      });
      console.log("MongoDB primary connected to database: petpetclub");
      mongoose.model("GPTHistory", GPTHistorySchema, "gpt_history");

    }
    return conn;
  } catch (e) {
    console.log("ERROR: ", e);
  }
  
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};



export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Get connection for reads
    const readConn = await getReadConnection();

    const isUtilCreateGPT =
      event.resource?.includes("/util/newGPT") ||
      event.path?.includes("/util/newGPT");
    
    const isUtilGPT =
      event.resource?.includes("/util/gpt") ||
      event.path?.includes("/util/gpt");

    const isFileUtilGPT = 
      event.resource?.includes("/util/fileGPT") ||
      event.path?.includes("/util/fileGPT");

    if (isUtilCreateGPT) {
      try {
        console.log("before generateContent");
        let body = JSON.parse(event.body || '{}');
        
        // Connect to primary database for writes
        await connectToMongoDB();
        const GPTHistoryModel = mongoose.model("GPTHistory");
        
        const newGPT = new GPTHistoryModel({
          _id: new ObjectId(body.id),
          userId: body.userId,
          petId: body.petId,
          GPT: []
        });
        await newGPT.save();

        
        return {
          statusCode: 200,
          body: JSON.stringify({ id: newGPT._id}),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (e) {
        console.log("ERROR IN CHATBOT UTIL: ", e);
      }    
    } if (isUtilGPT) {
      console.log("IS UTIL GPT");
      // Use read connection for finding GPTHistory
      const GPTHistory = readConn.model("GPTHistory");
      const petId = event.pathParameters?.petId;
      const existedGPTList = await GPTHistory.find({petId: petId, deleted: false});
      const httpMethod = event.httpMethod;

      switch (httpMethod) {
        case "GET": 
          console.log("EXISTED GPT: ", existedGPTList);
          return {
            statusCode: 200,
            body: JSON.stringify({ gpt: existedGPTList }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        default: 
          return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
      }
    } 
    else if (isFileUtilGPT) {
      try {
        console.log("before generateContent TEST" );
        let body = await parse(event);
        const GPTHistory = mongoose.model("GPTHistory");
        const httpMethod = event.httpMethod;
        switch (httpMethod) {
          case "POST":
            try {
              let file = body.files?.[0];
              console.log("FILE: ", file);
              let message;
              if (!file) {
                return {
                  statusCode: 400,
                  body: JSON.stringify({ 
                    error: "Missing file",
                  }),
                  headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                  },
                }; 
              }
              let fileBuffer = file.content;
              if (file.filename.includes('.txt')) {
                message = fileBuffer.toString('utf-8');
              } else if (file.filename.includes('.pdf')) {
                message = await extractPdfText(fileBuffer);
              } else if (file.filename.includes('.jpg') || file.filename.includes('.jpeg') || file.filename.includes('.png')) {
                message = await extractTextFromImg(fileBuffer);
              } else {               
                await officeParser.parseOfficeAsync(fileBuffer)
                .then(data => {
                  console.log(data);
                  message = data;
                })
                .catch(err => console.error(err))
              }

              return {
                statusCode: 200,
                body: JSON.stringify({ 
                  message: "Text taken successfully from file",
                  prompt: message
                }),
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }; 
            } catch(e) {
              console.log("ERROR: ", e)
              return {
                statusCode: 500,
                body: JSON.stringify({ error: e }),
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              };
            }
          
          default: 
            return {
              statusCode: 405,
              body: JSON.stringify({ error: "Method Not Allowed" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
        }
        
      } catch (e) {
        console.log("ERROR IN CHATBOT UTIL: ", e);
      }       
    }
    else {
      try {
        console.log("before generateContent TEST" );
        let body = JSON.parse(event.body || '{}');
        // Use read connection for finding GPTHistory
        const GPTHistoryRead = readConn.model("GPTHistory");
        const gptId = event.pathParameters?.chatGPTId;
        const existedGPT = await GPTHistoryRead.findOne({_id: gptId});
        const httpMethod = event.httpMethod;

        switch (httpMethod) {
          case "GET":
            return {
              statusCode: 200,
              body: JSON.stringify({ gpt: existedGPT.GPT, id: existedGPT._id }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          case "POST":
            const text = await generateWithRotation(body.prompt);
            const gpt = {
              GPTPrompt: body.prompt,
              GPTAnswer: text
            };
            
            // Connect to primary database for writes
            await connectToMongoDB();
            const GPTHistoryModel = mongoose.model("GPTHistory");
            const primaryGPT = await GPTHistoryModel.findOne({_id: gptId});
            
            if (primaryGPT) {
              primaryGPT.GPT.push(gpt);
              await primaryGPT.save();

            }
            
            return {
              statusCode: 200,
              body: JSON.stringify({  gpt: primaryGPT.GPT, id: primaryGPT._id }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };

          case "DELETE":
            // Connect to primary database for writes
            await connectToMongoDB();
            const GPTHistoryModelDelete = mongoose.model("GPTHistory");
            const primaryGPTDelete = await GPTHistoryModelDelete.findOne({_id: gptId});
            
            if (primaryGPTDelete) {
              primaryGPTDelete.deleted = true;
              await primaryGPTDelete.save();

            }
            
            return {
              statusCode: 200,
              body: JSON.stringify({ message: "GPT has been successfully deleted"}),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          default: 
            return {
              statusCode: 405,
              body: JSON.stringify({ error: "Method Not Allowed" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
        }
        
      } catch (e) {
        console.log("ERROR IN CHATBOT UTIL: ", e);
      }    
    }
  } catch (error) {
    console.error("ERROR: ", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error_message: "INTERNAL_ERROR" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};