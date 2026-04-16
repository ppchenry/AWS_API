const mongoose = require("mongoose");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3");
const { logError } = require("./logger");
const env = require("../config/env");

const BASE_URL = env.AWS_BUCKET_BASE_URL;
const BUCKET = env.AWS_BUCKET_NAME;

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
  bmp: "image/bmp",
  pdf: "application/pdf",
};

function getFileExtension(file) {
  const originalname = String(file?.originalname || "");
  const lastDotIndex = originalname.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === originalname.length - 1) {
    return "jpg";
  }
  return originalname.slice(lastDotIndex + 1).toLowerCase();
}

function getFileMime(file) {
  const extension = getFileExtension(file);
  return MIME_BY_EXTENSION[extension] || "image/jpeg";
}

function getFileSize(file) {
  try {
    const bytes = file.buffer.length;
    return {
      bytes,
      kilobytes: bytes / 1024,
      megabytes: bytes / (1024 * 1024),
    };
  } catch (error) {
    logError("Error getting file size", { scope: "utils.s3Upload", error });
    return null;
  }
}

/**
 * Upload an image file to S3 and track it in the ImageCollection.
 * Expects { buffer: Buffer, originalname: string } format.
 */
async function addImageFileToStorage(image, folder, owner = "user") {
  const ImageCollection = mongoose.model("ImageCollection");
  const img = await ImageCollection.create({});

  const mimeType = getFileMime(image);
  const size = getFileSize(image);
  const ext = getFileExtension(image);

  const fileName = `${img._id}.${ext}`;
  const url = `${BASE_URL}/${folder}/${fileName}`;

  const params = {
    Bucket: BUCKET,
    Key: `${folder}/${fileName}`,
    Body: image.buffer,
    ACL: "public-read",
    ContentType: mimeType || "image/jpeg",
  };

  await s3Client.send(new PutObjectCommand(params));

  await ImageCollection.updateOne(
    { _id: img._id },
    {
      fileName,
      url,
      fileSize: size?.megabytes,
      mimeType,
      owner,
    }
  );

  return url;
}

module.exports = { addImageFileToStorage, getFileSize };
