// @ts-nocheck
import mongoose from "mongoose";
import AWS from "aws-sdk";
import axios from "axios";
import mime from 'mime';
import { parse } from "lambda-multipart-parser";
import UserSchema from "./models/User.js";
import ImageCollectionSchema from "./models/ImageCollection.js";
import PetSchema from "./models/Pet.js";
import PetLostSchema from "./models/PetLost.js";
import PetFoundSchema from "./models/PetFound.js";
import NotificationSchema from "./models/Notifications.js";
import s3Client from "./config/awsBucketConfig.js"
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";


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
    mongoose.model("ImageCollection", ImageCollectionSchema, "image_collection");
    mongoose.model("Pets", PetSchema, "pets");
    mongoose.model("PetLost", PetLostSchema, "pet_lost");
    mongoose.model("PetFound", PetFoundSchema, "pet_found");
    mongoose.model("Notifications", NotificationSchema, "notifications");
  }
  return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

const base64ToBuffer = (base64String) => {
  // Remove data:image/...;base64, prefix if present
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
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
    const isPetLost = event.resource?.includes("/pets/pet-lost") || event.path?.includes("/pets/pet-lost");
    const isPetFound = event.resource?.includes("/pets/pet-found") || event.path?.includes("/pets/pet-found");
    const GetS3Image = event.resource?.includes("/pets/gets3Image") || event.path?.includes("/pets/gets3Image");
    const UploadArrayImages = event.resource?.includes("/pets/upload-array-images") || event.path?.includes("/pets/upload-array-images");
    const isNotifications = event.resource?.includes("/notifications") || event.path?.includes("/notifications");

    if (UploadArrayImages) {
      try {
        // Parse JSON body directly (not multipart)
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch (e) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              error_message: "INVALID_REQUEST_BODY",
              details: "Failed to parse JSON body"
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        // Extract data from body
        const {
          business,
          faceFrontArray = [],
          faceLeftArray = [],
          faceRightArray = [],
          faceUpperArray = [],
          faceLowerArray = [],
          noseFrontArray = [],
          noseLeftArray = [],
          noseRightArray = [],
          noseUpperArray = [],
          noseLowerArray = [],
          petId,
          userId
        } = body;

        // Validate required fields
        if (!petId || !userId) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              error: "Missing required fields: petId and userId are required"
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        // Initialize arrays to store uploaded image URLs
        const uploadedFaceFrontUrls = [];
        const uploadedFaceLeftUrls = [];
        const uploadedFaceRightUrls = [];
        const uploadedFaceUpperUrls = [];
        const uploadedFaceLowerUrls = [];
        const uploadedNoseFrontUrls = [];
        const uploadedNoseLeftUrls = [];
        const uploadedNoseRightUrls = [];
        const uploadedNoseUpperUrls = [];
        const uploadedNoseLowerUrls = [];

        // Helper function to process and upload images from base64 array
        const processImageArray = async (base64Array, basePath, urlArray) => {
          if (Array.isArray(base64Array) && base64Array.length > 0) {
            for (let i = 0; i < base64Array.length; i++) {
              const base64Image = base64Array[i];
              if (base64Image) {
                try {
                  const buffer = base64ToBuffer(base64Image);

                  // Determine file extension from base64 string
                  let extension = 'jpg';
                  if (base64Image.includes('data:image/png')) {
                    extension = 'png';
                  } else if (base64Image.includes('data:image/jpeg') || base64Image.includes('data:image/jpg')) {
                    extension = 'jpg';
                  }

                  const multerFile = {
                    buffer: buffer,
                    originalname: `image-${Date.now()}-${i + 1}.${extension}`,
                  };

                  const url = await addImageFileToStorage(
                    multerFile,
                    `${basePath}/image-${Date.now()}-${i + 1}`
                  );

                  if (url) {
                    urlArray.push(url);
                  }
                } catch (error) {
                  console.error(`Error uploading image ${i} to ${basePath}:`, error);
                  // Continue processing other images even if one fails
                }
              }
            }
          }
        };

        // Process all face images in parallel for better performance
        await Promise.all([
          processImageArray(faceFrontArray, `user-uploads/pets/${petId}/face/faceFront`, uploadedFaceFrontUrls),
          processImageArray(faceLeftArray, `user-uploads/pets/${petId}/face/faceLeft`, uploadedFaceLeftUrls),
          processImageArray(faceRightArray, `user-uploads/pets/${petId}/face/faceRight`, uploadedFaceRightUrls),
          processImageArray(faceUpperArray, `user-uploads/pets/${petId}/face/faceUpper`, uploadedFaceUpperUrls),
          processImageArray(faceLowerArray, `user-uploads/pets/${petId}/face/faceLower`, uploadedFaceLowerUrls),
        ]);

        // Process all nose images in parallel for better performance
        await Promise.all([
          processImageArray(noseFrontArray, `user-uploads/pets/${petId}/nose/noseFront`, uploadedNoseFrontUrls),
          processImageArray(noseLeftArray, `user-uploads/pets/${petId}/nose/noseLeft`, uploadedNoseLeftUrls),
          processImageArray(noseRightArray, `user-uploads/pets/${petId}/nose/noseRight`, uploadedNoseRightUrls),
          processImageArray(noseUpperArray, `user-uploads/pets/${petId}/nose/noseUpper`, uploadedNoseUpperUrls),
          processImageArray(noseLowerArray, `user-uploads/pets/${petId}/nose/noseLower`, uploadedNoseLowerUrls),
        ]);

        // Return the successful response
        return {
          statusCode: 201,
          body: JSON.stringify({
            petId: petId,
            userId: userId,
            business: business,
            faceFrontArray: uploadedFaceFrontUrls,
            faceLeftArray: uploadedFaceLeftUrls,
            faceRightArray: uploadedFaceRightUrls,
            faceUpperArray: uploadedFaceUpperUrls,
            faceLowerArray: uploadedFaceLowerUrls,
            noseFrontArray: uploadedNoseFrontUrls,
            noseLeftArray: uploadedNoseLeftUrls,
            noseRightArray: uploadedNoseRightUrls,
            noseUpperArray: uploadedNoseUpperUrls,
            noseLowerArray: uploadedNoseLowerUrls,
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };

      } catch (error) {
        console.error("Error:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            error: "Internal server error while uploading images",
            details: error.message
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    }
    else if (GetS3Image) {
      try {
        // Parse query string (API Gateway handles this differently based on type)
        const query = event.queryStringParameters || {};
        const src = decodeURIComponent(query.url || '');

        if (!src) {
          return {
            statusCode: 400,
            body: 'Missing url',
            headers: { 'Content-Type': 'text/plain' },
          };
        }

        let url;
        try {
          url = new URL(src);
        } catch (e) {
          return {
            statusCode: 400,
            body: 'Invalid URL',
            headers: { 'Content-Type': 'text/plain' },
          };
        }

        // Whitelist check
        const s3Like = /(^|\.)s3([.-][a-z0-9-]+)?\.amazonaws\.com$/i;
        const allowedHosts = ['petpetclub.s3.ap-southeast-1.amazonaws.com'];
        const isAllowed = s3Like.test(url.hostname) || allowedHosts.includes(url.hostname);

        if (!isAllowed) {
          return {
            statusCode: 403,
            body: 'Host not allowed',
            headers: { 'Content-Type': 'text/plain' },
          };
        }

        // Helper: Direct HTTP fetch
        const fetchViaHttp = async () => {
          const response = await fetch(src, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; PetPetClub/1.0) AppleWebKit/537.36 Chrome/120',
              'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
              // Referer can help with some anti-bot protections
              'Referer': event.headers?.origin || event.headers?.Referer || '',
            },
          });

          if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const contentType = response.headers.get('content-type') || 'application/octet-stream';

          return {
            buffer: Buffer.from(arrayBuffer),
            contentType,
          };
        };

        // Helper: Fetch directly from S3 using credentials
        const fetchViaS3 = async () => {
          let bucket, key, region = process.env.AWS_BUCKET_REGION;
          const path = url.pathname.replace(/^\//, '');

          // Virtual-hosted style: bucket.s3.region.amazonaws.com
          const virtualMatch = url.hostname.match(/^([^.]+)\.s3[.-]([a-z0-9-]+)\.amazonaws\.com$/i);
          if (virtualMatch) {
            bucket = virtualMatch[1];
            region = virtualMatch[2] || region;
            key = path;
          }
          // Path-style: s3.region.amazonaws.com/bucket/key or s3.amazonaws.com/bucket/key
          else if (/^s3[.-]?[a-z0-9-]*\.amazonaws\.com$/i.test(url.hostname)) {
            const parts = path.split('/');
            if (parts.length < 1) throw new Error('Invalid S3 path');
            bucket = parts.shift();
            key = parts.join('/');
            const regionMatch = url.hostname.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com$/i);
            if (regionMatch) region = regionMatch[1];
          } else {
            throw new Error('Unable to parse S3 URL');
          }

          if (!bucket || !key) throw new Error('Missing bucket or key');

          // Use environment variables for credentials (set in Lambda config)
          const accessKeyId = process.env.AWSACCESSID;
          const secretAccessKey = process.env.AWSSECRETKEY;

          if (!accessKeyId || !secretAccessKey) {
            throw new Error('AWS credentials not configured');
          }

          // Reuse S3 client per region
          const cacheKey = region;
          let s3 = s3ClientCache.get(cacheKey);
          if (!s3) {
            s3 = new S3Client({
              region,
              credentials: {
                accessKeyId,
                secretAccessKey,
              },
            });
            s3ClientCache.set(cacheKey, s3);
          }

          const command = new GetObjectCommand({ Bucket: bucket, Key: key });
          const resp = await s3.send(command);

          // Stream to buffer
          if (!resp.Body) throw new Error('No body in S3 response');
          const chunks = [];
          for await (const chunk of resp.Body) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const contentType = resp.ContentType || 'application/octet-stream';

          return { buffer, contentType };
        };

        // Try HTTP first, fallback to direct S3
        let data;
        try {
          data = await fetchViaHttp();
        } catch (httpError) {
          console.warn('HTTP fetch failed, trying direct S3:', httpError.message);
          try {
            data = await fetchViaS3();
          } catch (s3Error) {
            console.error('Both HTTP and S3 fetch failed:', s3Error.message);
            return {
              statusCode: 502,
              body: 'Failed to fetch image',
              headers: { 'Content-Type': 'text/plain' },
            };
          }
        }

        return {
          statusCode: 200,
          isBase64Encoded: true, // Important for binary data
          headers: {
            'Content-Type': data.contentType,
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*',
          },
          body: data.buffer.toString('base64'),
        };

      } catch (err) {
        console.error('Image proxy error:', err);
        return {
          statusCode: 500,
          body: 'Internal server error',
          headers: { 'Content-Type': 'text/plain' },
        };
      }
    }
    else if (isPetLost) {
      // Use read connection for reads
      const PetLostRead = readConn.model("PetLost");
      // Connect to primary for writes
      await connectToMongoDB();
      const PetLost = mongoose.model("PetLost");
      const httpMethod = event.httpMethod;
      switch (httpMethod) {
        case "GET": {
          // Use read connection for finding PetLost records
          const pets = await PetLostRead.find({})
            .sort({ lostDate: -1 })
            .lean();

          if (!pets || pets.length === 0) {
            return {
              statusCode: 404,
              body: JSON.stringify({ error: "No pets found" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }

          return {
            statusCode: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
              message: "All lost pets retrieved successfully",
              count: pets.length,
              pets,
            }),
          };
        }
        case "POST": {
          try {
            const form = await parse(event);
            console.log("FORM FILE: ", form.files, form);

            let birthday;

            if (form.birthday) {
              birthday = parseDDMMYYYY(form.birthday);
            } else {
              birthday = null;
            }

            // Use read connection for finding Pet
            const PetRead = readConn.model("Pets");
            // Connect to primary for writes
            await connectToMongoDB();
            const Pet = mongoose.model("Pets");

            if (form.petId) {
              const pet = await PetRead.findOne({ _id: form.petId });
              if (pet) {
                // Update in primary database
                await Pet.updateOne({ _id: form.petId }, { $set: { status: form.status } });

              }
            }

            // Create in primary database
            const pet = await PetLost.create({
              userId: form.userId,
              petId: form.petId,
              name: form.name,
              birthday: birthday,
              weight: form.weight,
              sex: form.sex,
              sterilization: form.sterilization,
              animal: form.animal,
              breed: form.breed,
              description: form.description,
              remarks: form.remarks,
              status: form.status,
              owner: form.owner,
              ownerContact1: form.ownerContact1,
              lostDate: parseDDMMYYYY(form.lostDate),
              lostLocation: form.lostLocation,
              lostDistrict: form.lostDistrict,
              serial_number: "",
            });

            let url = "";
            if (form.files && Array.isArray(form.files) && form.files.length > 0) {
              for (const file of form.files) {
                if (file?.content) {
                  const multerFile = {
                    buffer: file.content,
                    originalname: file.filename || "upload.jpg",
                  };
                  url = await addImageFileToStorage(
                    multerFile,
                    `user-uploads/pets/${pet._id}`
                  );
                  if (url) {
                    pet.breedimage.push(url);
                  }
                }
              }
            } else if (form.breedimage) {
              pet.breedimage = Array.isArray(form.breedimage)
                ? form.breedimage
                : (form.breedimage ? form.breedimage.split(',') : []);
            }

            // Use read connection for finding last PetLost/PetFound
            const PetFoundRead = readConn.model("PetFound");
            const lastLostPet = await PetLostRead.findOne({})
              .sort({ serial_number: -1 })  // Descending order
              .select('serial_number')
              .lean();

            const lastFoundPet = await PetFoundRead.findOne({})
              .sort({ serial_number: -1 })  // Descending order
              .select('serial_number')
              .lean();

            let lastPet;
            console.log(lastLostPet, lastFoundPet);
            if (lastLostPet === null) {
              lastPet = lastFoundPet;
            }
            else if (lastFoundPet === null) {
              lastPet = lastLostPet;
            }
            else if (Number(lastLostPet.serial_number) > Number(lastFoundPet.serial_number)) {
              lastPet = lastLostPet;
            }
            else {
              lastPet = lastFoundPet;
            }

            let latestNumber = Number(lastPet.serial_number) + 1;
            pet.serial_number = latestNumber.toString();

            // Save in primary database
            await pet.save();


            return {
              statusCode: 201,
              body: JSON.stringify({
                message: "Successfully added pet",
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
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }
        }
        case "DELETE": {
          const IDtoDelete = event.pathParameters?.petLostID;
          if (!IDtoDelete) {
            return {
              statusCode: 400,
              body: JSON.stringify({ error: "ID is required" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }

          // Delete from primary database
          const result = await PetLost.deleteOne({ petId: IDtoDelete });


          if (result.deletedCount === 0) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: "No record with the specified ID exists"
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }

          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: "Pet lost record deleted successfully",
            }),
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

    }
    else if (isPetFound) {
      // Use read connection for reads
      const PetFoundRead = readConn.model("PetFound");
      // Connect to primary for writes
      await connectToMongoDB();
      const PetFound = mongoose.model("PetFound");
      const httpMethod = event.httpMethod;
      switch (httpMethod) {
        case "GET": {
          // Use read connection for finding PetFound records
          const pets = await PetFoundRead.find({})
            .sort({ lostDate: -1 })
            .lean();

          if (!pets || pets.length === 0) {
            return {
              statusCode: 404,
              body: JSON.stringify({ error: "No pets found" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }

          return {
            statusCode: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
              message: "All lost pets retrieved successfully",
              count: pets.length,
              pets,
            }),
          };
        }
        case "POST": {
          try {
            const form = await parse(event);
            console.log("FORM FILE: ", form.files, form);

            // Create in primary database
            const pet = await PetFound.create({
              animal: form.animal,
              breed: form.breed,
              description: form.description,
              remarks: form.remarks,
              status: form.status,
              owner: form.owner,
              ownerContact1: form.ownerContact1,
              foundDate: parseDDMMYYYY(form.foundDate),
              foundLocation: form.foundLocation,
              foundDistrict: form.foundDistrict,
              serial_number: "",
            });

            let url = "";
            if (form.files && Array.isArray(form.files) && form.files.length > 0) {
              for (const file of form.files) {
                if (file?.content) {
                  const multerFile = {
                    buffer: file.content,
                    originalname: file.filename || "upload.jpg",
                  };
                  url = await addImageFileToStorage(
                    multerFile,
                    `user-uploads/pets/${pet._id}`
                  );
                  if (url) {
                    pet.breedimage.push(url);
                  }
                }
              }
            } else if (form.breedimage) {
              pet.breedimage = form.breedimage;
            }

            // Use read connection for finding last PetLost/PetFound
            const PetLostRead = readConn.model("PetLost");
            const lastLostPet = await PetLostRead.findOne({})
              .sort({ serial_number: -1 })  // Descending order
              .select('serial_number')
              .lean();

            const lastFoundPet = await PetFoundRead.findOne({})
              .sort({ serial_number: -1 })  // Descending order
              .select('serial_number')
              .lean();

            let lastPet;
            if (Number(lastLostPet.serial_number) > Number(lastFoundPet.serial_number)) {
              lastPet = lastLostPet;
            }
            else {
              lastPet = lastFoundPet;
            }


            let latestNumber = Number(lastPet.serial_number) + 1;
            pet.serial_number = latestNumber.toString();

            if (pet.breedimage.length > 0) {
              await pet.save();
            } else {
              await pet.save(); // Save even if no images
            }


            return {
              statusCode: 201,
              body: JSON.stringify({
                message: "Successfully added pet",
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
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }
        }
        case "DELETE": {
          const IDtoDelete = event.pathParameters?.petFoundID;
          if (!IDtoDelete) {
            return {
              statusCode: 400,
              body: JSON.stringify({ error: "ID is required" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }

          // Delete from primary database
          const result = await PetFound.deleteOne({ _id: IDtoDelete });


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: "Pet lost record deleted successfully",
            }),
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

    }
    else if (isNotifications) {
      const userId = event.pathParameters?.userId;

      if (!userId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "userId is required" }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Use read connection for reads
      const NotificationRead = readConn.model("Notifications");

      // Connect to primary for writes (only needed for PUT)
      await connectToMongoDB();
      const Notifications = mongoose.model("Notifications");

      const httpMethod = event.httpMethod;

      switch (httpMethod) {
        case "GET": {
          try {
            const notifications = await NotificationRead.find({
              userId: userId,
            })
              .sort({ createdAt: -1 })           // newest first
              .lean();

            if (!notifications || notifications.length === 0) {
              return {
                statusCode: 200,
                body: JSON.stringify({
                  message: "No notifications found for this user",
                  count: 0,
                  notifications: [],
                }),
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              };
            }

            return {
              statusCode: 200,
              body: JSON.stringify({
                message: "Notifications retrieved successfully",
                count: notifications.length,
                notifications,
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          } catch (error) {
            console.error("Error fetching notifications:", error);
            return {
              statusCode: 500,
              body: JSON.stringify({ error: "Failed to retrieve notifications" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }
        }

        case "POST": {
          try {
              const form = JSON.parse(event.body);

              const newNotification = await Notifications.create({
                  userId: userId,                   // from path
                  type: form.type,                  // required
                  isArchived: form.isArchived,
                  petId: form.petId || null,
                  petName: form.petName,
                  nextEventDate: parseDDMMYYYY(form.nextEventDate),
                  nearbyPetLost: form.nearbyPetLost,
              });


              return {
                  statusCode: 200,
                  body: JSON.stringify({
                      message: "Notification created successfully",
                      notification: newNotification,
                      id: newNotification._id,
                  }),
                  headers: {
                      "Content-Type": "application/json",
                      "Access-Control-Allow-Origin": "*",
                  },
              };
          } catch (error) {
              console.error("Error creating notification:", error);
              return {
                  statusCode: 500,
                  body: JSON.stringify({ error: "Failed to create notification" }),
                  headers: {
                      "Content-Type": "application/json",
                      "Access-Control-Allow-Origin": "*",
                  },
              };
          }
        }

        case "PUT": {
          try {
            const notificationId = event.pathParameters?.notificationId;

            if (!notificationId) {
              return {
                statusCode: 400,
                body: JSON.stringify({ error: "notificationId is required" }),
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              };
            }

            const updateData = { isArchived: true };

            // Update in primary
            const result = await Notifications.updateOne(
              { _id: notificationId, userId: userId }, // important: belongs to this user
              { $set: updateData }
            );

            if (result.matchedCount === 0) {
              return {
                statusCode: 404,
                body: JSON.stringify({ error: "Notification not found or does not belong to this user" }),
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              };
            }


            return {
              statusCode: 200,
              body: JSON.stringify({
                message: "Notification archived successfully",
                notificationId,
              }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          } catch (error) {
            console.error("Error archiving notification:", error);
            return {
              statusCode: 500,
              body: JSON.stringify({ error: "Failed to archive notification" }),
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            };
          }
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
    }
    else {
      try {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
          console.log(body);
        } catch (e) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              error_message: "INVALID_REQUEST_BODY",
              details: "Failed to parse JSON body"
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        // Extract data from body
        const {
          qrImage,
          petImage,
          tagId
        } = body;

        // Validate required fields
        if (!tagId) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              error: "Missing required fields: tagId is required"
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        // Helper function to upload single base64 image
        const uploadBase64Image = async (base64Image, path) => {
          if (!base64Image) {
            return null;
          }

          const buffer = base64ToBuffer(base64Image);

          // Determine file extension from base64 string
          let extension = 'jpg';
          if (base64Image.includes('data:image/png')) {
            extension = 'png';
          } else if (base64Image.includes('data:image/jpeg') || base64Image.includes('data:image/jpg')) {
            extension = 'jpg';
          }

          const multerFile = {
            buffer: buffer,
            originalname: `image-${Date.now()}.${extension}`,
          };

          const url = await addImageFileToStorage(
            multerFile,
            `${path}-${Date.now()}`
          );

          return url;
        };

        // Upload both images in parallel (handles nulls gracefully)
        const [qrUrl, petUrl] = await Promise.all([
          qrImage ? uploadBase64Image(qrImage, `user-uploads/pets/${tagId}/qr-code`) : Promise.resolve(null),
          petImage ? uploadBase64Image(petImage, `user-uploads/pets/${tagId}/pet-image`) : Promise.resolve(null)
        ]);

        // Return the successful response
        return {
          statusCode: 201,
          body: JSON.stringify({
            tagId: tagId,
            qrUrl: qrUrl || '',
            petUrl: petUrl || '',
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };

      } catch (error) {
        console.error("Error uploading images:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            error: "Internal server error while uploading images",
            details: error.message
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error_message: "INTERNAL_ERROR",
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};