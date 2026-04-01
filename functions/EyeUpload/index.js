import mongoose from "mongoose";
import mime from 'mime';
import { parse } from "lambda-multipart-parser";
import UserSchema from "./models/User.js";
import ApiLogSchema from "./models/ApiLog.js";
import EyeAnalysisLogSchema from "./models/EyeAnalysisLog.js";
import ImageCollectionSchema from "./models/ImageCollection.js";
import NgoCounterSchema from "./models/NgoCounter.js";
import PetSchema from "./models/Pet.js";
import s3Client from "./config/awsBucketConfig.js"
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { authJWT } from './authJWT.js';
import { corsHeaders, handleOptions } from './cors.js';



const BASE_URL = process.env.AWS_BUCKET_BASE_URL;
const BUCKET = process.env.AWS_BUCKET_NAME;

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    // Register schemas
    mongoose.model("User", UserSchema, "users");
    mongoose.model("ApiLog", ApiLogSchema, "api_logs");
    mongoose.model("EyeAnalysisLog", EyeAnalysisLogSchema, "eye_analysis_logs");
    mongoose.model("ImageCollection", ImageCollectionSchema, "image_collection");
    mongoose.model("Pets", PetSchema, "pets");
    mongoose.model("NgoCounters", NgoCounterSchema, "ngo_counters");
  }
  return conn;
};

function incrementAndPad(num, targetLength = 5) {
  // 1. Increment the number
  num++;
  
  // 2. Convert the number to a string and add leading zeros
  const paddedNum = num.toString().padStart(targetLength, '0');
  
  // 3. Return the new string
  return paddedNum;
}


/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

const getFileSize = (file) => {
  try {
    const fileSizeInBytes = file.buffer.length;
    const fileSizeInKilobytes = fileSizeInBytes / 1024;
    const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

    return {
      bytes: fileSizeInBytes,
      kilobytes: fileSizeInKilobytes,
      megabytes: fileSizeInMegabytes,
    };
  } catch (error) {
    console.error("Error getting file size:", error);
    return null;
  }
};

// Function to get file MIME type
const getFileMime = (file) => {
  const mimeType = mime.getType(file.originalname);
  return mimeType;
};

const getFileExtension = (file) => {
  const originalname = file.originalname;
  const extension = originalname.split(".").pop();
  return extension;
};

function parseDDMMYYYY(dateString) {
  if (!dateString) return null;

  // If it's already an ISO string, use it directly
  if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(dateString);
  }

  // Parse DD/MM/YYYY format
  const [day, month, year] = dateString.split("/");
  if (
    day &&
    month &&
    year &&
    day.length <= 2 &&
    month.length <= 2 &&
    year.length === 4
  ) {
    return new Date(year, month - 1, day);
  }

  // Fallback to original parsing
  return new Date(dateString);
};

const addImageFileToStorage = async (image, folder, owner = "user") => {
  try {
    // Connect to primary database for writes
    await connectToMongoDB();
    const ImageCollection = mongoose.model("ImageCollection");
    const img = await ImageCollection.create({});
    const mimeType = getFileMime(image);
    const size = getFileSize(image);
    const ext = getFileExtension(image);
    console.log("MIMETYPE: ", mimeType);
    console.log("SIZE: ", size);
    console.log("ext: ", ext);

    const fileName = `${img._id}.${ext}`;
    const url = `${BASE_URL}/${folder}/${fileName}`;
    const params = {
      Bucket: BUCKET,
      Key: `${folder}/${fileName}`,
      Body: image.buffer,
      ACL: 'public-read', // Set the ACL to public-read
      ContentType: 'image/jpeg', // Set the Content-Type to the appropriate image type
    };
    const results = await s3Client.send(new PutObjectCommand(params));
    console.log(results);
    await ImageCollection.updateOne(
      { _id: img._id },
      {
        fileName: fileName,
        url: url,
        fileSize: size.megabytes,
        mimeType: mimeType,
        owner: owner,
      }
    );


    return url;
  } catch (err) {
    console.log("Error", err);
  }
};

// Post data to external endpoint
async function postData(url, data) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    console.log("postData response:", response);
    return response.json();
  } catch (error) {
    console.log("postData error:", error);
    return { error: error.message };
  }
}

const s3ClientCache = new Map();

export async function handler(event, context) {
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  const startTime = performance.now();

  try {
    // Get connection for reads
    const readConn = await getReadConnection();
    console.log("event resource: ", event.resource);
    const isUtilUploadImage = event.resource?.includes("/util/uploadImage") || event.path?.includes("/util/uploadImage");
    const isUpdatePetEyeImage = event.resource?.includes("/pets/updatePetEye") || event.path?.includes("/pets/updatePetEye");
    const isUpdatePetImage = event.resource?.includes("/pets/updatePetImage") || event.path?.includes("/pets/updatePetImage");
    const isCreatePetBasicInfoWithImage = event.resource?.includes("/pets/create-pet-basic-info-with-image") || event.path?.includes("/pets/create-pet-basic-info-with-image");
    const isEyeAnalysis = event.resource?.includes("/analysis/eye-upload") || event.path?.includes("/analysis/eye-upload");
    const isUtilUploadPetBreedImage = event.resource?.includes("/util/uploadPetBreedImage") || event.path?.includes("/util/uploadPetBreedImage")
    const isPetBreedAnalysis = event.resource?.includes("/analysis/breed") || event.path?.includes("/analysis/breed");
    
    if (isUtilUploadImage) {
      // Parse multipart form data
      const formData = await parse(event);
      const files = formData.files || [];
      const petId = formData.petId;

      // Validate inputs
      if (!petId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "petId is required" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      if (files.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "No files uploaded" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      if (files.length > 5) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Maximum 5 images allowed" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Validate image formats
      const hasJpegOrPng = files.some(
        (file) => file.contentType === "image/jpeg" || file.contentType === "image/png"
      );

      if (!hasJpegOrPng) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "At least one file is not in JPEG or PNG format" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Upload images to S3
      const multerStyleFile = {
        buffer: files[0].content,
        originalname: files[0].filename,
      };
      const url = await addImageFileToStorage(multerStyleFile, `user-uploads/breed_analysis`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Successfully uploaded images of pet",
          url: url,
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    else if (isUtilUploadPetBreedImage) {

      try {
        console.log("IS UTIL UPLOAD PET BREED IMAGE BEFORE FORM DATA: ");

        const formData = await parse(event);
        console.log("IS UTIL UPLOAD PET BREED IMAGE: ", formData);
        const files = formData.files?.[0];
        console.log("FILES FOR UTIL UPLOAD PET BREED IMAGE: ", files);
        if (files.length === 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "No files uploaded" }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        if (files.contentType != "image/jpeg" && files.contentType != "image/png") {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "At least one file is not in JPEG or PNG format" }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        const multerStyleFile = {
          buffer: files.content,
          originalname: files.filename,
        };

        const endpoint = 'user-uploads/' + formData.url

        // Upload images to S3
        const urls = await addImageFileToStorage(multerStyleFile, endpoint)
        console.log("URLS: ", urls);
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: "Successfully uploaded images of pet",
            url: urls,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (e) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: e.toString(),
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    } else if (isUpdatePetEyeImage) {
      try {
        console.log("IS UPDATE PET EYE IMAGE");
        const body = JSON.parse(event.body || '{}');
        // Use read connection for finding pet
        const PetsRead = readConn.model("Pets");
        const pet = await PetsRead.findOne({ _id: body.petId });
        
        if (!pet) {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: "Pet not found" }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        const object = {
          eyeimage_left1: body.leftEyeImage1,
          eyeimage_right1: body.rightEyeImage1,
          date: new Date(body.date)
        };

        // Connect to primary database for writes
        await connectToMongoDB();
        const PetsModel = mongoose.model("Pets");
        const primaryPet = await PetsModel.findOne({ _id: body.petId });
        if (primaryPet) {
          primaryPet.eyeImages.push(object);
          await primaryPet.save();
        }


        console.log("FINISH PET EYE IMAGE");

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: "Successfully uploaded images of pet",
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (e) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: e,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

    } else if (isEyeAnalysis) {
      console.log("IS EYE ANALYSIS");

      // Connect to primary database for writes
      await connectToMongoDB();
      const ApiLog = mongoose.model("ApiLog");
      const activityLog = await ApiLog.create({});


      // Get models (use read connection for reads)
      const UserRead = readConn.model("User");
      const EyeAnalysisLogRead = readConn.model("EyeAnalysisLog");

      // Extract petId from path parameters
      const petId = event.pathParameters?.petId;
      if (!petId) {
        activityLog.error = "MISSING_PET_ID";
        await activityLog.save();
        
        const endTime = performance.now();
        const timeTaken = endTime - startTime;
        return {
          statusCode: 400,
          body: JSON.stringify({
            error_message: "MISSING_PET_ID",
            request_id: activityLog._id,
            time_taken: `${timeTaken} ms`,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
      console.log("BEFORE FORMDATA");
      // Parse multipart form data
      const formData = await parse(event);
      const userId = formData.userId;
      const imageUrl = formData.image_url;
      const file = formData.files?.[0];
      console.log("FORMDATA: ", formData);

      // Validate inputs
      if (!userId || (!imageUrl && !file)) {
        activityLog.error = "MISSING_ARGUMENTS";
        await activityLog.save();
        
        const endTime = performance.now();
        const timeTaken = endTime - startTime;
        return {
          statusCode: 400,
          body: JSON.stringify({
            error_message: "MISSING_ARGUMENTS",
            request_id: activityLog._id,
            time_taken: `${timeTaken} ms`,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
      console.log("FINISH VALIDATE INPUT");

      // Validate user (using read connection)
      const user = await UserRead.findOne({ _id: userId });
      if (!user) {
        activityLog.error = "AUTHENTICATION_ERROR";
        await activityLog.save();
        const endTime = performance.now();
        const timeTaken = endTime - startTime;
        return {
          statusCode: 401,
          body: JSON.stringify({
            error_message: "AUTHENTICATION_ERROR",
            request_id: activityLog._id,
            time_taken: `${timeTaken} ms`,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
      console.log("FINISH VALIDATE USER");


      activityLog.userId = user._id;

      // Handle file upload
      let downloadURL;
      if (file) {
        const fileSizeInMb = file.content.length / (1024 * 1024);

        // Validate file format
        if (
          !file.contentType.includes("jpeg") &&
          !file.contentType.includes("jpg") &&
          !file.contentType.includes("png") &&
          !file.contentType.includes("gif") &&
          !file.contentType.includes("tiff")
        ) {
          activityLog.error = "IMAGE_ERROR_UNSUPPORTED_FORMAT";
          await activityLog.save();
          const endTime = performance.now();
          const timeTaken = endTime - startTime;
          return {
            statusCode: 400,
            body: JSON.stringify({
              error_message: "IMAGE_ERROR_UNSUPPORTED_FORMAT",
              request_id: activityLog._id,
              time_taken: `${timeTaken} ms`,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        // Validate file size (updated to 30 MB)
        if (fileSizeInMb > 30) {
          activityLog.error = "IMAGE_FILE_TOO_LARGE";
          await activityLog.save();
          
          const endTime = performance.now();
          const timeTaken = endTime - startTime;
          return {
            statusCode: 413,
            body: JSON.stringify({
              error_message: "IMAGE_FILE_TOO_LARGE",
              request_id: activityLog._id,
              time_taken: `${timeTaken} ms`,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        } else if (fileSizeInMb === 0) {
          activityLog.error = "IMAGE_FILE_TOO_SMALL";
          await activityLog.save();
          const endTime = performance.now();
          const timeTaken = endTime - startTime;
          return {
            statusCode: 413,
            body: JSON.stringify({
              error_message: "IMAGE_FILE_TOO_SMALL",
              request_id: activityLog._id,
              time_taken: `${timeTaken} ms`,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        // Upload file to S3
        downloadURL = await addImageFileToStorage(file, `user-uploads/eye/${petId}`);
      } else {
        downloadURL = imageUrl;
      }

      console.log("FINISH VALIDATE DOWNLOADURL");


      // Call external analysis endpoint
      const endpointURL = `${process.env.VM_PUBLIC_IP}${process.env.DOCKER_IMAGE}`;
      const endpointHeatmapURL = `${process.env.VM_PUBLIC_IP}${process.env.HEATMAP}`;
      console.log("BEFORE HEATMAP AND EYE ANALYSIS");
      const data = await Promise.allSettled([postData(endpointURL, { url: downloadURL }), postData(endpointHeatmapURL, { url: downloadURL })]);

      console.log("AFTER HEATMAP AND EYE ANALYSIS");

      console.log("DATA: ", data);
      console.log("data 0:", data[0]);
      console.log("data 1:", data[1]);

      // Check for errors in analysis response
      const keys = Object.keys(data[0].value);
      if (keys.includes("error") || keys.includes("400") || keys.includes("404") || data[0].status != "fulfilled") {
        const value = Object.values(data[0].value)[0];
        activityLog.error = value;
        await activityLog.save();
        const endTime = performance.now();
        const timeTaken = endTime - startTime;
        const statusCode = isNaN(Number(keys[0])) ? 400 : 200;
        return {
          statusCode,
          body: JSON.stringify({
            error_message: value,
            request_id: activityLog._id,
            time_taken: `${timeTaken} ms`,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Save successful analysis
      activityLog.userId = user._id;
      activityLog.image_url = downloadURL;
      activityLog.result = data;
      await activityLog.save();

      const EyeAnalysisLogModel = mongoose.model("EyeAnalysisLog");
      const newEyeAnalysisLog = new EyeAnalysisLogModel({
        result: data[0].value,
        image: downloadURL,
        petId: petId,
        heatmap: data[1].value.heatmap
      });
      await newEyeAnalysisLog.save();


      const endTime = performance.now();
      const timeTaken = endTime - startTime;

      // // Return successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          result: data[0].value,
          heatmap: data[1].value.heatmap,
          request_id: activityLog._id,
          time_taken: `${timeTaken} ms`,
          status: 200,
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    } else if (isCreatePetBasicInfoWithImage) {
      try {
        // const authError = authJWT(event);
        // if (authError) {
        //   // Add CORS headers to auth error response
        //   return {
        //     ...authError,
        //     headers: {
        //       ...authError.headers,
        //       ...corsHeaders(event),
        //     },
        //   };
        // }

        // CORRECTED VERSION - Fix order and add proper error handling
        // Use read connection for finding user
        const UserRead = readConn.model("User");
        const PetRead = readConn.model("Pets");
        const NgoCounter = readConn.model("NgoCounters");
        const form = await parse(event);

        const user = await UserRead.findOne({ _id: form.userId });

        console.log("Event: ", event);

        if (!user) {
          return {
            statusCode: 404,
            body: JSON.stringify({
              error: "User not found",
            }),
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(event),
            },
          };
        }

        let ngoPetId = "";
        console.log("EVENT HEADERS ORIGIN: ", event.headers?.origin);
        if (event.headers.origin != undefined && (event.headers?.origin.includes("petdb") || event.multiValueHeaders?.origin.includes("petdb"))) {
          console.log("GOES FOR MAKING ngoPetId");
          const counter = await NgoCounter.findOneAndUpdate(
            { ngoId: form.ngoId },
            { $inc: { seq: 1 } },
            { upsert: true, new: true } // return updated document
          );

          console.log("Updated counter:", counter);
          const ngoSequence = counter.seq;
          const suffix = String(ngoSequence).padStart(5, "0");
          console.log("SUFFIX: ", suffix);
          ngoPetId = counter.ngoPrefix + suffix;
          console.log("NGOPETID:", ngoPetId);
        }
      

        // ✅ FIX 1: CHECK FOR DUPLICATES BEFORE CREATING PET
        if (ngoPetId != undefined && ngoPetId != null && ngoPetId != "") {
          const petList = await PetRead.find({ ngoPetId: ngoPetId });
          if (petList.length > 0) {
            return {
              statusCode: 400,
              body: JSON.stringify({
                error: "Duplicated pet with ngoPetId",
              }),
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders(event),
              },
            };
          }
        }

        let receivedDate;
        let birthday;
        let sterilizationDate;

        if (form.birthday) {
          birthday = parseDDMMYYYY(form.birthday);
        } else {
          birthday = null;
        }

        if (form.receivedDate) {
          receivedDate = parseDDMMYYYY(form.receivedDate);
        } else {
          receivedDate = null;
        }

        console.log("sterilizationDate: ",form.sterilizationDate);

        if (form.sterilizationDate) {
          sterilizationDate = parseDDMMYYYY(form.sterilizationDate);
        } else {
          sterilizationDate = null;
        }

        // ✅ FIX 2: Process images FIRST before creating pet
        let imageUrls = [];
        try {
          if (form.files && Array.isArray(form.files) && form.files.length > 0) {
            for (const file of form.files) {
              if (file?.content) {
                const multerFile = {
                  buffer: file.content,
                  originalname: file.filename || "upload.jpg",
                };
                // Create temporary ID for storage path (or use a staging folder)
                const tempId = new mongoose.Types.ObjectId();
                const url = await addImageFileToStorage(
                  multerFile,
                  `user-uploads/pets/${tempId}`
                );
                if (url) {
                  imageUrls.push(url);
                }
              }
            }
          } else if (form.breedimage) {
            imageUrls.push(form.breedimage);
          }
        } catch (imageError) {
          console.error("Error uploading images:", imageError);
          return {
            statusCode: 500,
            body: JSON.stringify({
              error: "Failed to upload images",
              details: imageError.message
            }),
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(event),
            },
          };
        }
        
        const pet = await PetRead.create({
          userId: user._id,
          name: form.name,
          birthday: birthday,
          weight: form.weight,
          sex: form.sex,
          sterilization: form.sterilization,
          sterilizationDate: form.sterilizationDate,
          adoptionStatus: form.adoptionStatus,
          animal: form.animal,
          breed: form.breed,
          bloodType: form.bloodType,
          features: form.features,
          info: form.info,
          status: form.status,
          owner: form.owner,
          ngoId: form.ngoId,
          ngoPetId: ngoPetId,
          ownerContact1: form.ownerContact1,
          ownerContact2: form.ownerContact2,
          contact1Show: form.contact1Show,
          contact2Show: form.contact2Show,
          receivedDate: receivedDate,
          breedimage: imageUrls, // ✅ FIX 4: Add images during creation
          locationName: form.location,
          position: form.position
        });

        // ✅ No need for separate save since create() already saves
        return {
          statusCode: 201,
          body: JSON.stringify({
            message: "Successfully added pet",
            id: pet._id
          }),
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(event),
          },
        };
      } catch (error) {
        console.error("Error updating pet:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: error
          }),
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(event),
          },
        };
      }
    } else if (isUpdatePetImage) {
      const form = await parse(event);

      // Use read connection for finding pet
      const PetRead = readConn.model("Pets");
      console.log("FILE: ", form);

      const petId = form.petId;

      const pet = await PetRead.findOne({ _id: petId });
      
      if (!pet) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Pet not found" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Connect to primary database for writes
      await connectToMongoDB();
      const PetModel = mongoose.model("Pets");
      const primaryPet = await PetModel.findOne({ _id: petId });
      
      if (!primaryPet) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Pet not found in primary database" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Handle removed images
      if (form.removedIndices) {
        try {
          const removedIndices = JSON.parse(form.removedIndices);
          console.log("Removing images at indices:", removedIndices);

          if (Array.isArray(removedIndices) && removedIndices.length > 0) {
            const sortedIndices = removedIndices.sort((a, b) => b - a);

            for (const index of sortedIndices) {
              if (index >= 0 && index < primaryPet.breedimage.length) {
                primaryPet.breedimage.splice(index, 1);
              }
            }

            console.log("Images after removal:", primaryPet.breedimage);
          }
        } catch (parseError) {
          console.error("Error parsing removedIndices:", parseError);
        }
      }

      // Add new images
      if (form.files && Array.isArray(form.files) && form.files.length > 0) {
        for (const file of form.files) {
          if (file?.content) {
            const multerFile = {
              buffer: file.content,
              originalname: file.filename || "upload.jpg",
            };
            const url = await addImageFileToStorage(
              multerFile,
              `user-uploads/pets/${primaryPet._id}`
            );
            if (url) {
              primaryPet.breedimage.push(url);
            }
          }
        }
      }

      if (form.name !== undefined) primaryPet.name = form.name;
      if (form.animal !== undefined) primaryPet.animal = form.animal;
      if (form.birthday !== undefined) primaryPet.birthday = parseDDMMYYYY(form.birthday);
      if (form.weight !== undefined) primaryPet.weight = form.weight;
      if (form.sex !== undefined) primaryPet.sex = form.sex;
      if (form.sterilization !== undefined) primaryPet.sterilization = form.sterilization;
      if (form.sterilizationDate !== undefined) primaryPet.sterilizationDate = parseDDMMYYYY(form.sterilizationDate);
      if (form.adoptionStatus !== undefined) primaryPet.adoptionStatus = parseDDMMYYYY(form.adoptionStatus);
      if (form.breed !== undefined) primaryPet.breed = form.breed;
      if (form.bloodType !== undefined) primaryPet.bloodType = form.bloodType;
      if (form.features !== undefined) primaryPet.features = form.features;
      if (form.info !== undefined) primaryPet.info = form.info;
      if (form.status !== undefined) primaryPet.status = form.status;
      if (form.owner !== undefined) primaryPet.owner = form.owner;
      if (form.ngoId !== undefined) primaryPet.ngoId = form.ngoId;
      if (form.tagId !== undefined) primaryPet.tagId = form.tagId;
      if (form.ownerContact1 !== undefined) primaryPet.ownerContact1 = form.ownerContact1;
      if (form.ownerContact2 !== undefined) primaryPet.ownerContact2 = form.ownerContact2;
      if (form.contact1Show !== undefined) primaryPet.contact1Show = form.contact1Show;
      if (form.contact2Show !== undefined) primaryPet.contact2Show = form.contact2Show;
      if (form.isRegistered !== undefined) primaryPet.isRegistered = form.isRegistered;
      if (form.receivedDate !== undefined) primaryPet.receivedDate = parseDDMMYYYY(form.receivedDate);

      // For tagId
      // const CurrentTagId = primaryPet.tagId;
      // if (form.tagId !== undefined && form.tagId !== '' && form.tagId !== CurrentTagId) {
      //   const duplicateTag = await PetModel.findOne({ tagId: form.tagId });
      //   if (duplicateTag) {
      //     return {
      //       statusCode: 400,
      //       body: JSON.stringify({ error: "Duplicated pet with tagId" }),
      //       headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      //     };
      //   }
      //   primaryPet.tagId = form.tagId;
      // }

      // For ngoPetId (same pattern)
      const CurrentngoPetId = primaryPet.ngoPetId;
      if (form.ngoPetId !== undefined && form.ngoPetId !== CurrentngoPetId) {
        const duplicateNgo = await PetModel.findOne({ ngoPetId: form.ngoPetId });
        if (duplicateNgo) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "Duplicated pet with ngoPetId" }),
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          };
        }
        primaryPet.ngoPetId = form.ngoPetId;
      }

      // === 5. Single Save – Everything Updated at Once ===
      await primaryPet.save({ validateBeforeSave: true });

      console.log("Pet successfully updated:", primaryPet);

      // Return the successful response
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Pet basic info updated successfully",
          id: primaryPet._id,
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    else if (isPetBreedAnalysis) {
      try {
        console.log("START OF PET BREED ANALYSIS");
        console.log("EVENT BODY: ", event.body);
        const body = JSON.parse(event.body || "{}");
        const endpoint = process.env.VM_BREED_PUBLIC_IP + process.env.BREED_DOCKER_IMAGE;
        console.log("BODY: ", body);
        const params = new URLSearchParams();
        params.append("species", body.species);
        params.append("url", body.url);
        console.log("ENDPOINTS: ", endpoint);
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });
          const jsonResponse = await response.json();
          console.log("postData response:", jsonResponse);
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: "Successfully analyze breed",
              result: jsonResponse
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        } catch (e) {
          console.log("ERROR TRY CATCH FOR FETCHING: ", e);
        }

      } catch (e) {
        console.log("ERROR: ", e);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: e
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    } else {
      try {
        // Use read connection for finding user
        const UserRead = readConn.model("User");
        const PetRead = readConn.model("Pets");
        const form = await parse(event);
        console.log("FORM: ", form)
        const user = await UserRead.findOne({ _id: form.userId });

        if (!user) {
          return {
            statusCode: 404,
            body: JSON.stringify({
              error: "User not found",
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        let receivedDate;
        let birthday;

        if (form.birthday) {
          birthday = parseDDMMYYYY(form.birthday);
        } else {
          birthday = null;
        }

        if (form.receivedDate) {
          receivedDate = parseDDMMYYYY(form.receivedDate);
        } else {
          receivedDate = null;
        }

        if (form.ngoPetId != undefined && form.ngoPetId != null && form.ngoPetId != "") {
          const petList = await PetRead.find({ ngoPetId: form.ngoPetId });
          if (petList.length > 0) {
            return {
              statusCode: 400,
              body: JSON.stringify({
                error: "Duplicated pet with ngoPetId",
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }
        }

        // Connect to primary database for writes
        await connectToMongoDB();
        const PetModel = mongoose.model("Pets");
        
        const pet = await PetModel.create({
          userId: user._id,
          name: form.name,
          birthday: birthday,
          weight: form.weight,
          sex: form.sex,
          sterilization: form.sterilization,
          animal: form.animal,
          breed: form.breed,
          features: form.features,
          info: form.info,
          status: form.status,
          owner: form.owner,
          ngoId: form.ngoId,
          ngoPetId: form.ngoPetId,
          ownerContact1: form.ownerContact1,
          ownerContact2: form.ownerContact2,
          contact1Show: form.contact1Show,
          contact2Show: form.contact2Show,
          receivedDate: receivedDate,
        });

        return {
          statusCode: 201,
          body: JSON.stringify({
            message: "Successfully added pet",
            form,
            id: pet._id
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (error) {
        console.error("Error updating pet:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: error,
            form,
            id: pet._id
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    }
  } catch (error) {
    // Handle errors
    await connectToMongoDB();
    const ApiLog = mongoose.model("ApiLog");
    const activityLog = await ApiLog.create({});
    activityLog.error = "INTERNAL_ERROR";
    await activityLog.save();
    const endTime = performance.now();
    const timeTaken = endTime - startTime;
    console.error("Error Message:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error_message: "INTERNAL_ERROR",
        request_id: activityLog._id,
        time_taken: `${timeTaken} ms`,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};