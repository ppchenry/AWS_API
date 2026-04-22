const { parse } = require("lambda-multipart-parser");
const { addImageFileToStorage } = require("../utils/s3Upload");
const {
  createErrorResponse,
  createSuccessResponse,
} = require("../utils/response");
const { logError } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_FILES = 1;

/**
 * Allowlisted S3 subfolder prefixes for uploadPetBreedImage.
 * Only these prefixes are accepted from the client.
 * Prevents arbitrary S3 key injection.
 */
const ALLOWED_UPLOAD_PREFIXES = new Set([
  "breed_analysis",
  "pets",
  "eye",
  "profile",
]);

/**
 * POST /util/uploadImage
 * Upload a single image to S3 from multipart form data.
 */
async function uploadImage({ event }) {
  const scope = "services.upload.uploadImage";
  try {
    // Rate limit: 30 uploads per 5 minutes per caller
    const rl = await enforceRateLimit({
      event,
      action: "uploadImage",
      identifier: event.userId,
      limit: 30,
      windowSec: 300,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    const formData = await parse(event);
    const files = formData.files || [];

    if (files.length === 0) {
      return createErrorResponse(400, "eyeUpload.errors.noFilesUploaded", event);
    }

    if (files.length > MAX_FILES) {
      return createErrorResponse(400, "eyeUpload.errors.tooManyFiles", event);
    }

    // Validate FIRST file (which is the one we upload), not any file
    if (!ALLOWED_IMAGE_TYPES.has(files[0].contentType)) {
      return createErrorResponse(400, "eyeUpload.errors.invalidImageFormat", event);
    }

    const multerStyleFile = {
      buffer: files[0].content,
      originalname: files[0].filename,
    };
    const url = await addImageFileToStorage(
      multerStyleFile,
      "user-uploads/breed_analysis"
    );

    return createSuccessResponse(200, event, {
      message: "Successfully uploaded images of pet",
      url,
    });
  } catch (error) {
    logError("Upload image failed", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * POST /util/uploadPetBreedImage
 * Upload a pet breed image to an allowlisted S3 subfolder.
 *
 * The client-supplied `url` field is validated against ALLOWED_UPLOAD_PREFIXES.
 * This replaces the previous sanitization-only approach with a proper allowlist.
 */
async function uploadPetBreedImage({ event }) {
  const scope = "services.upload.uploadPetBreedImage";
  try {
    // Rate limit: 30 uploads per 5 minutes per caller
    const rl = await enforceRateLimit({
      event,
      action: "uploadPetBreedImage",
      identifier: event.userId,
      limit: 30,
      windowSec: 300,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    const formData = await parse(event);
    const file = formData.files?.[0];

    if (!file) {
      return createErrorResponse(400, "eyeUpload.errors.noFilesUploaded", event);
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.contentType)) {
      return createErrorResponse(400, "eyeUpload.errors.invalidImageFormat", event);
    }

    // Allowlist-based folder validation
    const rawPath = (formData.url || "").trim();
    if (!rawPath) {
      return createErrorResponse(400, "eyeUpload.errors.invalidFolder", event);
    }

    // Extract the top-level folder segment and validate against allowlist
    const segments = rawPath.replace(/^\/+/, "").split("/");
    const topFolder = segments[0];

    if (!ALLOWED_UPLOAD_PREFIXES.has(topFolder)) {
      return createErrorResponse(400, "eyeUpload.errors.invalidFolder", event);
    }

    // Reject path traversal attempts
    if (segments.some((s) => s === ".." || s === ".")) {
      return createErrorResponse(400, "eyeUpload.errors.invalidFolder", event);
    }

    const multerStyleFile = {
      buffer: file.content,
      originalname: file.filename,
    };

    const endpoint = "user-uploads/" + segments.join("/");
    const url = await addImageFileToStorage(multerStyleFile, endpoint);

    return createSuccessResponse(200, event, {
      message: "Successfully uploaded images of pet",
      url,
    });
  } catch (error) {
    logError("Upload pet breed image failed", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { uploadImage, uploadPetBreedImage };
