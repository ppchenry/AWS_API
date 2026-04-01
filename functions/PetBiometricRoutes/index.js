const mongoose = require("mongoose");
const { performance } = require("perf_hooks");

const PetFacialImageSchema = require("./models/PetFacialImage.js");
const PetSchema = require("./models/Pet.js");
const ApiLogSchema = require("./models/ApiLog.js");
const UserBusinessSchema = require("./models/Secret.js");

const { corsHeaders, handleOptions } = require('./cors');
const { authJWT } = require('./authJWT');


let conn = null;
let conn2 = null;

const connectToMongoDB = async () => {
  if (!conn) {
    conn = await mongoose.createConnection(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      tls: true,
      tlsAllowInvalidCertificates: false,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    conn.model("PetFacialImage", PetFacialImageSchema, "pets_facial_image");
    conn.model("Pet", PetSchema, "pets");
    conn.model("ApiLog", ApiLogSchema, "api_log");
  }

  if (!conn2) {
    conn2 = await mongoose.createConnection(process.env.BUSINESS_MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      tls: true,
      tlsAllowInvalidCertificates: false,
    });
    console.log("MongoDB conn2 connected");
    conn2.model("UserBusiness", UserBusinessSchema, "users");
  }

  return { conn, conn2 };
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
  // Ensure primary connection is established
  await connectToMongoDB();
  return conn;
};

// Post data to external endpoint
async function postData(url = "", data = {}) {
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

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const startTime = performance.now();

  // Handle OPTIONS requests (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return handleOptions(event);
  }

  // Authenticate request with JWT
  const authError = authJWT(event);
  if (authError) {
    // Add CORS headers to auth error response
    return {
      ...authError,
      headers: {
        ...authError.headers,
        ...corsHeaders(event),
      },
    };
  }

  try {
    const { conn, conn2 } = await connectToMongoDB();
    // Get read connection for reads
    const readConn = await getReadConnection();

    const isPetBiometricRegister =
      event.resource?.includes("/register") || event.path?.includes("/register");
    const isVerify =
      event.resource?.includes("/verifyPet") || event.path?.includes("/verifyPet");

    if (isPetBiometricRegister) {
      // Use read connection for reads
      const PetFacialImageRead = readConn.model("PetFacialImage");
      const PetRead = readConn.model("Pet");
      const ApiLogRead = readConn.model("ApiLog");
      
      // Connect to primary for writes
      const PetFacialImage = conn.model("PetFacialImage");
      const Pet = conn.model("Pet");
      const ApiLog = conn.model("ApiLog");

      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error_message: "INVALID_REQUEST_BODY",
            request_id: null,
            time_taken: "0 ms",
          }),
          headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        };
      }

      console.log("Parsed body:", body);

      const activityLog = await ApiLog.create({});

      if (
        !body.faceFrontArray ||
        !body.faceLowerArray ||
        !body.faceRightArray ||
        !body.faceLeftArray ||
        !body.faceUpperArray ||
        !body.petId ||
        !body.userId
      ) {
        activityLog.error = "MISSING_ARGUMENTS";
        await activityLog.save();
        const endTime = performance.now();
        return {
          statusCode: 400,
          body: JSON.stringify({
            error_message: "MISSING_ARGUMENTS",
            request_id: activityLog._id,
            time_taken: `${endTime - startTime} ms`,
          }),
          headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        };
      }

      const {
        faceFrontArray,
        faceLeftArray,
        faceRightArray,
        faceUpperArray,
        faceLowerArray,
        noseFrontArray = [],
        noseLeftArray = [],
        noseRightArray = [],
        noseUpperArray = [],
        noseLowerArray = [],
        petId,
        userId,
        business,
      } = body;

      // Use read connection for finding existing PetFacialImage
      const oldPetFacialLog = await PetFacialImageRead.findOne({ petId });
      if (oldPetFacialLog) {
        console.log("THERE IS A OLD PETFACIAL LOG");
        const updateData = {
          FaceImage: {
            FaceFront: faceFrontArray,
            FaceLeft: faceLeftArray,
            FaceRight: faceRightArray,
            FaceUpper: faceUpperArray,
            FaceLower: faceLowerArray,
          },
          NoseImage: {
            NoseFront: noseFrontArray,
            NoseLeft: noseLeftArray,
            NoseRight: noseRightArray,
            NoseUpper: noseUpperArray,
            NoseLower: noseLowerArray,
          },
        };
        
        // Update in primary database
        const newPetFacialLog = await PetFacialImage.updateOne(
          { petId },
          { $set: updateData }
        );
        await Pet.updateOne({ _id: petId }, { isRegistered: true });
        
        activityLog.userId = userId;
        activityLog.result = newPetFacialLog;
        await activityLog.save();
        const endTime = performance.now();
        return {
          statusCode: 201,
          body: JSON.stringify({
            result: newPetFacialLog,
            request_id: activityLog._id,
            time_taken: `${endTime - startTime} ms`,
          }),
          headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        };
      } else {
        // Create in primary database
        const petFacialLog = await PetFacialImage.create({
          petId,
          FaceImage: {
            FaceFront: faceFrontArray,
            FaceLeft: faceLeftArray,
            FaceRight: faceRightArray,
            FaceUpper: faceUpperArray,
            FaceLower: faceLowerArray,
          },
          NoseImage: {
            NoseFront: noseFrontArray,
            NoseLeft: noseLeftArray,
            NoseRight: noseRightArray,
            NoseUpper: noseUpperArray,
            NoseLower: noseLowerArray,
          },
          RegisteredFrom: business,
        });
        await Pet.updateOne({ _id: petId }, { isRegistered: true });
        
        activityLog.userId = userId;
        activityLog.result = petFacialLog;
        await activityLog.save();
        const endTime = performance.now();
        return {
          statusCode: 201,
          body: JSON.stringify({
            result: petFacialLog,
            request_id: activityLog._id,
            time_taken: `${endTime - startTime} ms`,
          }),
          headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        };
      }
    }
    else if (isVerify) {
      console.log("IS VERIFY DOG BEFORE CONNECTING TO MODEL");

      // Use read connection for reads
      const PetFacialImageRead = readConn.model("PetFacialImage");
      const ApiLogRead = readConn.model("ApiLog");
      const UserBusiness = conn2.model("UserBusiness"); // conn2 remains unchanged
      
      // Connect to primary for writes
      const PetFacialImage = conn.model("PetFacialImage");
      const ApiLog = conn.model("ApiLog");
      console.log("IS VERIFY DOG AFTER CONNECTING TO MODEL");
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error_message: "INVALID_REQUEST_BODY", request_id: null, time_taken: "0 ms" }), headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        };
      }
      console.log("Parsed body:", body);
      const { userId, petId, access_secret, secret_key, image_url, animalType } = body;
      const file = body.files && body.files[0];
      if (!userId || !petId || !access_secret || !secret_key) {
        const activityLog = await ApiLog.create({ error: "MISSING_PARAMETER" });
        
        const endTime = performance.now();
        return {
          statusCode: 400,
          body: JSON.stringify(
            {
              error_message: "MISSING_PARAMETER", request_id: activityLog._id, time_taken: `${endTime - startTime} ms`
            }
          ),
          headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        };
      }
      // Use read connection for finding PetFacialImage
      const petFacial = await PetFacialImageRead.findOne({ petId });
      if (!petFacial) {
        const activityLog = await ApiLog.create({ error: "PET_NOT_REGISTERED", userId });
        
        const endTime = performance.now();
        return {
          statusCode: 400,
          body: JSON.stringify(
            {
              error_message: "Pet has not been registered. Please register pet",
              request_id: activityLog._id,
              time_taken: `${endTime - startTime} ms`
            }
          ),
          headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        };
      }
      console.log("ACCESS KEY: ", access_secret);
      console.log("SECRET KEY: ", secret_key);
      const business = await UserBusiness.findOne({ access_key: access_secret, access_secret: secret_key });
      console.log("BUSINESS: ", business);
      // const business = true;
      let activityLog;
      if (business) {
        activityLog = await ApiLog.create({ userId: business.business_name === "Pet pet club" ? userId : business._id });
      } else {
        const activityLog = await ApiLog.create({ error: "INVALID_CREDENTIALS", userId });
        const endTime = performance.now();
        return {
          statusCode: 400,
          body: JSON.stringify(
            {
              error_message: "Cannot find user with corresponding access key and secret key",
              request_id: activityLog._id,
              time_taken: `${endTime - startTime} ms`
            }
          ),
          headers: { "Content-Type": "application/json", ...corsHeaders(event) },
        };
      }
      let downloadURL;
      if (file) {
        const fileSizeinMb = file.content.length / (1024 * 1024);
        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/tiff"];
        if (!allowedTypes.includes(file.contentType)) {
          activityLog.error = "IMAGE_ERROR_UNSUPPORTED_FORMAT";
          await activityLog.save();
          
          const endTime = performance.now();
          return {
            statusCode: 400,
            body: JSON.stringify(
              {
                error_message: "IMAGE_ERROR_UNSUPPORTED_FORMAT",
                request_id: activityLog._id, time_taken: `${endTime - startTime} ms`
              }
            ),
            headers: { "Content-Type": "application/json", ...corsHeaders(event) },
          };
        }
        if (fileSizeinMb > 10) {
          activityLog.error = "IMAGE_FILE_TOO_LARGE";
          await activityLog.save();
          
          const endTime = performance.now();
          return {
            statusCode: 413,
            body: JSON.stringify(
              {
                error_message: "IMAGE_FILE_TOO_LARGE",
                request_id: activityLog._id,
                time_taken: `${endTime - startTime} ms`
              }
            ),
            headers: { "Content-Type": "application/json", ...corsHeaders(event) },
          };
        }
        if (fileSizeinMb === 0) {
          activityLog.error = "IMAGE_FILE_TOO_SMALL";
          await activityLog.save();
          
          const endTime = performance.now();
          return {
            statusCode: 413,
            body: JSON.stringify(
              {
                error_message: "IMAGE_FILE_TOO_SMALL",
                request_id: activityLog._id,
                time_taken: `${endTime - startTime} ms`
              }
            ),
            headers: { "Content-Type": "application/json", ...corsHeaders(event) },
          };
        }
        downloadURL = await addImageFileToStorage(file, "api/user-uploads/dog");
      } else {
        downloadURL = image_url;
      }
      console.log("DOWNLOAD URL:", downloadURL);
      console.log("API FACEID: ", process.env.FACEID_API);
      let result;
      try {
        result = await postData(
          process.env.FACEID_API,
          {
            face_original_urls: [petFacial.FaceImage.FaceFront[0], petFacial.FaceImage.FaceFront[1], petFacial.FaceImage.FaceFront[2]],
            face_inference_urls: [downloadURL],
            threshold: 0.6,
            species: body.animalType
          }
        );
      } catch (e) {
        console.log("ERROR VERIFY FACE ID: ", e);
      }



      console.log("RESULT:", result);
      activityLog.result = result;
      await activityLog.save();
      
      const endTime = performance.now();
      return {
        statusCode: 200,
        body: JSON.stringify(
          {
            result, request_id:
              activityLog._id,
            time_taken: `${endTime - startTime} ms`
          }
        ),
        headers: { "Content-Type": "application/json", ...corsHeaders(event) },
      };
    }
    else {
      const startTime = performance.now();

      try {
        // Use read connection for reads
        const PetFacialImageRead = readConn.model("PetFacialImage");
        const ApiLogRead = readConn.model("ApiLog");
        
        // Connect to primary for writes
        const PetFacialImage = conn.model("PetFacialImage");
        const ApiLog = conn.model("ApiLog");

        // Create activity log in primary database
        const activityLog = await ApiLog.create({});

        // Get petId from path parameters or query string
        const petId = event.pathParameters?.petId;

        // Validate petId
        if (!petId) {
          activityLog.error = "MISSING_PET_ID";
          await activityLog.save();
          
          const endTime = performance.now();
          return {
            statusCode: 400,
            body: JSON.stringify({
              error_message: "MISSING_PET_ID",
              details: "petId is required as path parameter or query string",
              request_id: activityLog._id,
              time_taken: `${endTime - startTime} ms`,
            }),
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(event)
            },
          };
        }

        // Fetch pet facial images from database (using read connection)
        const petFacialLog = await PetFacialImageRead.findOne({ petId });

        // Check if record exists
        if (!petFacialLog) {
          activityLog.error = "NO_FACIAL_IMAGES_FOUND";
          await activityLog.save();
          
          const endTime = performance.now();
          return {
            statusCode: 404,
            body: JSON.stringify({
              error_message: "NO_FACIAL_IMAGES_FOUND",
              details: `No facial recognition images found for petId: ${petId}`,
              request_id: activityLog._id,
              time_taken: `${endTime - startTime} ms`,
            }),
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(event)
            },
          };
        }

        // Log successful retrieval
        activityLog.result = {
          petId: petId,
          imagesFound: true,
        };
        await activityLog.save();

        const endTime = performance.now();

        // Return successful response with all facial images
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            petId: petId,
            faceImages: {
              faceFrontUrls: petFacialLog.FaceImage?.FaceFront || [],
              faceLeftUrls: petFacialLog.FaceImage?.FaceLeft || [],
              faceRightUrls: petFacialLog.FaceImage?.FaceRight || [],
              faceUpperUrls: petFacialLog.FaceImage?.FaceUpper || [],
              faceLowerUrls: petFacialLog.FaceImage?.FaceLower || [],
            },
            noseImages: {
              noseFrontUrls: petFacialLog.NoseImage?.NoseFront || [],
              noseLeftUrls: petFacialLog.NoseImage?.NoseLeft || [],
              noseRightUrls: petFacialLog.NoseImage?.NoseRight || [],
              noseUpperUrls: petFacialLog.NoseImage?.NoseUpper || [],
              noseLowerUrls: petFacialLog.NoseImage?.NoseLower || [],
            },
            request_id: activityLog._id,
            time_taken: `${endTime - startTime} ms`,
          }),
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(event)
          },
        };

      } catch (error) {
        console.error("Error in getPetFacialImages:", error);
        const endTime = performance.now();
        return {
          statusCode: 500,
          body: JSON.stringify({
            error_message: "INTERNAL_SERVER_ERROR",
            details: error.message,
            time_taken: `${endTime - startTime} ms`,
          }),
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(event)
          },
        };
      }
    }
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
      headers: { "Content-Type": "application/json", ...corsHeaders(event) },
    };
  }
};
