const mongoose = require("mongoose");
const { parse } = require("lambda-multipart-parser");
const { addImageFileToStorage } = require("../utils/s3Upload");
const {
  createErrorResponse,
  createSuccessResponse,
} = require("../utils/response");
const { logError } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");
const { loadAuthorizedPet } = require("../middleware/selfAccess");
const env = require("../config/env");

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/tiff",
]);
const MAX_FILE_SIZE_MB = 30;

/**
 * POST data to an external analysis endpoint.
 */
async function postData(url, data) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return response.json();
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * POST /analysis/eye-upload/{petId}
 *
 * Identity: uses event.userId from JWT, not client-supplied form field.
 * This closes H10 for the analysis audit trail.
 */
async function eyeUploadAnalysis({ event }) {
  const scope = "services.eyeAnalysis.eyeUploadAnalysis";
  const startTime = performance.now();
  let activityLog = null;

  try {
    // Rate limit: 10 eye analyses per 5 minutes per caller
    const rl = await enforceRateLimit({
      event,
      action: "eyeUploadAnalysis",
      identifier: event.userId,
      limit: 10,
      windowSec: 300,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "eyeUpload.rateLimited", event);
    }

    const ApiLog = mongoose.model("ApiLog");
    const User = mongoose.model("User");
    const EyeAnalysisLog = mongoose.model("EyeAnalysisLog");

    activityLog = await ApiLog.create({});

    const petId = event.pathParameters?.petId;

    // Use JWT identity — not form data
    const callerUserId = event.userId;

    // Verify caller exists and is active
    const user = await User.findOne({
      _id: callerUserId,
      deleted: { $ne: true },
    }).lean();

    if (!user) {
      activityLog.error = "USER_NOT_FOUND";
      await activityLog.save();
      return createErrorResponse(404, "eyeUpload.userNotFound", event);
    }

    activityLog.userId = user._id;

    // DB-backed ownership check via selfAccess helper
    const authResult = await loadAuthorizedPet({ event, petId });
    if (!authResult.isValid) {
      activityLog.error = authResult.error.statusCode === 404 ? "PET_NOT_FOUND" : "AUTHORIZATION_DENIED";
      await activityLog.save();
      return authResult.error;
    }

    // Parse multipart form data
    const formData = await parse(event);
    const imageUrl = formData.image_url;
    const file = formData.files?.[0];

    if (!imageUrl && !file) {
      activityLog.error = "MISSING_ARGUMENTS";
      await activityLog.save();
      return createErrorResponse(400, "eyeUpload.missingArguments", event);
    }

    // Handle file upload or use provided URL
    let downloadURL;
    if (file) {
      const fileSizeInMb = file.content.length / (1024 * 1024);

      if (!ALLOWED_IMAGE_TYPES.has(file.contentType)) {
        activityLog.error = "IMAGE_ERROR_UNSUPPORTED_FORMAT";
        await activityLog.save();
        return createErrorResponse(400, "eyeUpload.unsupportedFormat", event);
      }

      if (fileSizeInMb > MAX_FILE_SIZE_MB) {
        activityLog.error = "IMAGE_FILE_TOO_LARGE";
        await activityLog.save();
        return createErrorResponse(413, "eyeUpload.fileTooLarge", event);
      }

      if (fileSizeInMb === 0) {
        activityLog.error = "IMAGE_FILE_TOO_SMALL";
        await activityLog.save();
        return createErrorResponse(413, "eyeUpload.fileTooSmall", event);
      }

      // Wrap into multer-style object for s3Upload
      const multerFile = {
        buffer: file.content,
        originalname: file.filename || "upload.jpg",
      };
      downloadURL = await addImageFileToStorage(
        multerFile,
        `user-uploads/eye/${petId}`
      );
    } else {
      downloadURL = imageUrl;
    }

    // Call external analysis endpoints in parallel
    const endpointURL = `${env.VM_PUBLIC_IP}${env.DOCKER_IMAGE}`;
    const endpointHeatmapURL = `${env.VM_PUBLIC_IP}${env.HEATMAP}`;

    const data = await Promise.allSettled([
      postData(endpointURL, { url: downloadURL }),
      postData(endpointHeatmapURL, { url: downloadURL }),
    ]);

    // Check for errors in analysis response
    if (data[0].status !== "fulfilled" || !data[0].value) {
      activityLog.error = "ANALYSIS_FAILED";
      await activityLog.save();
      return createErrorResponse(500, "eyeUpload.analysisError", event);
    }

    const keys = Object.keys(data[0].value);
    if (
      keys.includes("error") ||
      keys.includes("400") ||
      keys.includes("404")
    ) {
      const value = Object.values(data[0].value)[0];
      activityLog.error = value;
      await activityLog.save();
      return createErrorResponse(400, "eyeUpload.analysisError", event);
    }

    // Save successful analysis
    activityLog.userId = user._id;
    activityLog.image_url = downloadURL;
    activityLog.result = data;
    await activityLog.save();

    await EyeAnalysisLog.create({
      result: data[0].value,
      image: downloadURL,
      petId,
      heatmap: data[1]?.value?.heatmap,
    });

    const endTime = performance.now();
    const timeTaken = endTime - startTime;

    return createSuccessResponse(200, event, {
      result: data[0].value,
      heatmap: data[1]?.value?.heatmap,
      request_id: activityLog._id,
      time_taken: `${timeTaken} ms`,
      status: 200,
    });
  } catch (error) {
    logError("Eye upload analysis failed", { scope, event, error });

    if (activityLog) {
      try {
        activityLog.error = "INTERNAL_ERROR";
        await activityLog.save();
      } catch {
        // Ignore save errors during error handling
      }
    }

    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { eyeUploadAnalysis };
