const mongoose = require("mongoose");
const { performance } = require("node:perf_hooks");

const { getBusinessConnection } = require("../config/db");
const { loadAuthorizedPet } = require("../middleware/selfAccess");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { verifyPetFace } = require("../utils/faceId");
const { logError, logWarn } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");
const { addImageFileToStorage, getFileSize } = require("../utils/s3Upload");
const { detectImageMimeFromBuffer, getBufferFromInlineFile } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const {
  registerPetBiometricSchema,
  verifyPetBiometricSchema,
} = require("../zodSchema/petBiometricSchema");

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/tiff",
]);
const MAX_FILE_SIZE_MB = 10;

function normalizeFaceIdResult(rawResult) {
  const normalized = {};

  if (typeof rawResult?.matched === "boolean") normalized.matched = rawResult.matched;
  else if (typeof rawResult?.match === "boolean") normalized.matched = rawResult.match;
  else if (typeof rawResult?.verified === "boolean") normalized.matched = rawResult.verified;
  else if (typeof rawResult?.is_match === "boolean") normalized.matched = rawResult.is_match;

  if (typeof rawResult?.confidence === "number") normalized.confidence = rawResult.confidence;
  else if (typeof rawResult?.score === "number") normalized.confidence = rawResult.score;
  else if (typeof rawResult?.similarity === "number") normalized.confidence = rawResult.similarity;
  else if (typeof rawResult?.probability === "number") normalized.confidence = rawResult.probability;

  if (typeof rawResult?.threshold === "number") normalized.threshold = rawResult.threshold;
  if (typeof rawResult?.species === "string") normalized.species = rawResult.species;
  if (typeof rawResult?.message === "string") normalized.message = rawResult.message;
  if (typeof rawResult?.request_id === "string") normalized.providerRequestId = rawResult.request_id;
  if (typeof rawResult?.requestId === "string") normalized.providerRequestId = rawResult.requestId;

  if (typeof normalized.matched === "boolean") {
    return normalized;
  }

  return null;
}

/**
 * Creates or updates stored biometric image sets for a pet after authorization.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any>, body?: Record<string, any> | null }} ctx
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function registerPetBiometric({ event, body }) {
  const scope = "services.petBiometric.registerPetBiometric";
  const startTime = performance.now();
  let activityLog = null;
  let operation = "updated";
  let statusCode = 200;

  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "petBiometricRegister",
      identifier: event.userId,
      limit: 10,
      windowSec: 300,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = registerPetBiometricSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const {
      faceFrontArray,
      faceLeftArray,
      faceRightArray,
      faceUpperArray,
      faceLowerArray,
      noseFrontArray,
      noseLeftArray,
      noseRightArray,
      noseUpperArray,
      noseLowerArray,
      petId,
      business,
    } = parseResult.data;

    const authResult = await loadAuthorizedPet({ event, petId });
    if (!authResult.isValid) {
      return authResult.error;
    }

    const ApiLog = mongoose.model("ApiLog");
    const Pet = mongoose.model("Pet");
    const PetFacialImage = mongoose.model("PetFacialImage");

    activityLog = await ApiLog.create({ userId: event.userId });

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
      ...(business ? { RegisteredFrom: business } : {}),
    };

    const session = await mongoose.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const petWriteResult = await Pet.updateOne(
          { _id: petId, deleted: { $ne: true } },
          { $set: { isRegistered: true } },
          { session }
        );

        if (petWriteResult.matchedCount === 0) {
          throw new Error("PET_NOT_FOUND");
        }

        const writeResult = await PetFacialImage.updateOne(
          { petId },
          {
            $set: updateData,
            $setOnInsert: { petId },
          },
          { upsert: true, session }
        );

        operation = writeResult.upsertedCount > 0 ? "created" : "updated";
        statusCode = operation === "created" ? 201 : 200;
      });
    } catch (error) {
      if (error?.message === "PET_NOT_FOUND") {
        activityLog.error = { code: "PET_NOT_FOUND" };
        await activityLog.save();
        return createErrorResponse(404, "petBiometric.petNotFound", event);
      }

      throw error;
    } finally {
      await session.endSession();
    }

    activityLog.result = {
      petId,
      operation,
      isRegistered: true,
    };
    await activityLog.save();

    return createSuccessResponse(statusCode, event, {
      result: {
        petId,
        operation,
        isRegistered: true,
      },
      request_id: activityLog._id,
      time_taken: `${performance.now() - startTime} ms`,
    });
  } catch (error) {
    logError("Pet biometric registration failed", {
      scope,
      event,
      error,
    });

    if (activityLog) {
      try {
        activityLog.error = { code: "INTERNAL_ERROR" };
        await activityLog.save();
      } catch (saveError) {
        logWarn("Failed to persist register activity log failure", {
          scope,
          event,
          error: saveError,
        });
      }
    }

    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Verifies a candidate pet image against the stored biometric reference set.
 * Supports either a direct image URL or an inline JSON file payload.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any>, body?: Record<string, any> | null }} ctx
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function verifyPetBiometric({ event, body }) {
  const scope = "services.petBiometric.verifyPetBiometric";
  const startTime = performance.now();
  let activityLog = null;

  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "petBiometricVerify",
      identifier: event.userId,
      limit: 10,
      windowSec: 300,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = verifyPetBiometricSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const {
      petId,
      access_secret,
      secret_key,
      image_url,
      files,
      animalType,
    } = parseResult.data;

    const authResult = await loadAuthorizedPet({ event, petId });
    if (!authResult.isValid) {
      return authResult.error;
    }

    const ApiLog = mongoose.model("ApiLog");
    const PetFacialImage = mongoose.model("PetFacialImage");

    activityLog = await ApiLog.create({ userId: event.userId });

    const petFacial = await PetFacialImage.findOne({ petId })
      .select("FaceImage.FaceFront")
      .lean();

    if (!petFacial?.FaceImage?.FaceFront?.length) {
      activityLog.error = { code: "PET_NOT_REGISTERED" };
      await activityLog.save();
      return createErrorResponse(404, "petBiometric.notRegistered", event);
    }

    const businessConnection = await getBusinessConnection();
    const UserBusiness = businessConnection.model("UserBusiness");
    const businesses = await UserBusiness.find({
      access_key: access_secret,
      access_secret: secret_key,
    })
      .select("_id business_name")
      .limit(2)
      .lean();
    const business = businesses[0] || null;

    if (businesses.length !== 1) {
      activityLog.error = { code: "INVALID_CREDENTIALS" };
      await activityLog.save();
      return createErrorResponse(400, "petBiometric.invalidCredentials", event);
    }

    let downloadURL = image_url || null;
    const inlineFile = Array.isArray(files) ? files[0] : null;

    if (!downloadURL && !inlineFile) {
      activityLog.error = { code: "MISSING_IMAGE_INPUT" };
      await activityLog.save();
      return createErrorResponse(400, "petBiometric.errors.imageRequired", event);
    }

    if (inlineFile) {
      const buffer = getBufferFromInlineFile(inlineFile);
      if (!buffer || buffer.length === 0) {
        activityLog.error = { code: "IMAGE_FILE_TOO_SMALL" };
        await activityLog.save();
        return createErrorResponse(413, "petBiometric.fileTooSmall", event);
      }

      const contentType = String(inlineFile.contentType || "").toLowerCase();
      const detectedContentType = detectImageMimeFromBuffer(buffer);
      if (!detectedContentType || !ALLOWED_IMAGE_TYPES.has(detectedContentType)) {
        activityLog.error = { code: "IMAGE_ERROR_UNSUPPORTED_FORMAT" };
        await activityLog.save();
        return createErrorResponse(400, "petBiometric.unsupportedFormat", event);
      }

      if (!ALLOWED_IMAGE_TYPES.has(contentType) || contentType !== detectedContentType) {
        activityLog.error = { code: "IMAGE_ERROR_UNSUPPORTED_FORMAT" };
        await activityLog.save();
        return createErrorResponse(400, "petBiometric.unsupportedFormat", event);
      }

      const uploadFile = {
        buffer,
        originalname: inlineFile.filename || "pet-biometric.jpg",
        contentType: detectedContentType,
      };
      const fileSize = getFileSize(uploadFile);

      if (!fileSize || fileSize.megabytes === 0) {
        activityLog.error = { code: "IMAGE_FILE_TOO_SMALL" };
        await activityLog.save();
        return createErrorResponse(413, "petBiometric.fileTooSmall", event);
      }

      if (fileSize.megabytes > MAX_FILE_SIZE_MB) {
        activityLog.error = { code: "IMAGE_FILE_TOO_LARGE" };
        await activityLog.save();
        return createErrorResponse(413, "petBiometric.fileTooLarge", event);
      }

      try {
        downloadURL = await addImageFileToStorage(uploadFile, "api/user-uploads/dog");
      } catch (error) {
        logError("Pet biometric image upload failed", {
          scope,
          event,
          error,
        });
      }

      if (!downloadURL) {
        activityLog.error = { code: "IMAGE_UPLOAD_FAILED" };
        await activityLog.save();
        return createErrorResponse(503, "petBiometric.uploadFailed", event);
      }
    }

    const sourceUrls = petFacial.FaceImage.FaceFront.filter(Boolean).slice(0, 3);
    const verificationResult = await verifyPetFace({
      sourceUrls,
      inferenceUrl: downloadURL,
      species: animalType,
      event,
    });

    if (!verificationResult.ok) {
      logError("FaceID verification failed", {
        scope,
        event,
        error: verificationResult.error,
        extra: {
          providerStatusCode: verificationResult.statusCode,
          providerResponse: verificationResult.data,
          petId,
        },
      });
      activityLog.error = { code: "FACEID_API_FAILED" };
      await activityLog.save();
      return createErrorResponse(503, "others.serviceUnavailable", event);
    }

    const normalizedResult = normalizeFaceIdResult(verificationResult.data);
    if (!normalizedResult) {
      logError("FaceID verification returned an unrecognized success payload", {
        scope,
        event,
        extra: {
          providerResponse: verificationResult.data,
          petId,
        },
      });
      activityLog.error = { code: "FACEID_INVALID_RESPONSE" };
      await activityLog.save();
      return createErrorResponse(503, "others.serviceUnavailable", event);
    }

    activityLog.userId = business.business_name === "Pet pet club"
      ? event.userId
      : business._id;
    activityLog.image_url = downloadURL;
    activityLog.result = normalizedResult;
    await activityLog.save();

    return createSuccessResponse(200, event, {
      result: normalizedResult,
      request_id: activityLog._id,
      time_taken: `${performance.now() - startTime} ms`,
    });
  } catch (error) {
    logError("Pet biometric verification failed", {
      scope,
      event,
      error,
    });

    if (activityLog) {
      try {
        activityLog.error = { code: "INTERNAL_ERROR" };
        await activityLog.save();
      } catch (saveError) {
        logWarn("Failed to persist verify activity log failure", {
          scope,
          event,
          error: saveError,
        });
      }
    }

    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * Returns the stored biometric image URLs for an authorized pet.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any> }} ctx
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
 */
async function getPetBiometric({ event }) {
  const scope = "services.petBiometric.getPetBiometric";
  const startTime = performance.now();
  let activityLog = null;

  try {
    const petId = event.pathParameters?.petId;
    const authResult = await loadAuthorizedPet({ event, petId });
    if (!authResult.isValid) {
      return authResult.error;
    }

    const ApiLog = mongoose.model("ApiLog");
    const PetFacialImage = mongoose.model("PetFacialImage");
    activityLog = await ApiLog.create({ userId: event.userId });

    const petFacial = await PetFacialImage.findOne({ petId })
      .select("petId FaceImage NoseImage")
      .lean();

    if (!petFacial) {
      activityLog.error = { code: "NO_FACIAL_IMAGES_FOUND" };
      await activityLog.save();
      return createErrorResponse(404, "petBiometric.notRegistered", event);
    }

    activityLog.result = {
      petId,
      imagesFound: true,
    };
    await activityLog.save();

    return createSuccessResponse(200, event, {
      petId,
      faceImages: {
        faceFrontUrls: petFacial.FaceImage?.FaceFront || [],
        faceLeftUrls: petFacial.FaceImage?.FaceLeft || [],
        faceRightUrls: petFacial.FaceImage?.FaceRight || [],
        faceUpperUrls: petFacial.FaceImage?.FaceUpper || [],
        faceLowerUrls: petFacial.FaceImage?.FaceLower || [],
      },
      noseImages: {
        noseFrontUrls: petFacial.NoseImage?.NoseFront || [],
        noseLeftUrls: petFacial.NoseImage?.NoseLeft || [],
        noseRightUrls: petFacial.NoseImage?.NoseRight || [],
        noseUpperUrls: petFacial.NoseImage?.NoseUpper || [],
        noseLowerUrls: petFacial.NoseImage?.NoseLower || [],
      },
      request_id: activityLog._id,
      time_taken: `${performance.now() - startTime} ms`,
    });
  } catch (error) {
    logError("Pet biometric retrieval failed", {
      scope,
      event,
      error,
    });

    if (activityLog) {
      try {
        activityLog.error = { code: "INTERNAL_ERROR" };
        await activityLog.save();
      } catch (saveError) {
        logWarn("Failed to persist get activity log failure", {
          scope,
          event,
          error: saveError,
        });
      }
    }

    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getPetBiometric,
  registerPetBiometric,
  verifyPetBiometric,
};