const mongoose = require("mongoose");
const { PutObjectCommand } = require("@aws-sdk/client-s3");

const env = require("../config/env");
const { getS3Client } = require("../config/s3");

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
  bmp: "image/bmp",
};

/**
 * Derives a file extension from an upload object.
 *
 * @param {{ originalname?: string }} file
 * @returns {string}
 */
function getFileExtension(file) {
  const originalname = String(file?.originalname || "");
  const lastDotIndex = originalname.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === originalname.length - 1) {
    return "jpg";
  }
  return originalname.slice(lastDotIndex + 1).toLowerCase();
}

/**
 * Resolves the MIME type for an upload object.
 *
 * @param {{ originalname?: string, contentType?: string }} file
 * @returns {string}
 */
function getFileMime(file) {
  if (file?.contentType) {
    return file.contentType;
  }
  return MIME_BY_EXTENSION[getFileExtension(file)] || "image/jpeg";
}

/**
 * Computes byte, KB, and MB sizes for an in-memory upload.
 *
 * @param {{ buffer?: Buffer }} file
 * @returns {{ bytes: number, kilobytes: number, megabytes: number } | null}
 */
function getFileSize(file) {
  if (!file?.buffer) {
    return null;
  }

  const bytes = file.buffer.length;
  return {
    bytes,
    kilobytes: bytes / 1024,
    megabytes: bytes / (1024 * 1024),
  };
}

/**
 * Uploads a file buffer to S3 and records its metadata in ImageCollection.
 *
 * @param {{ buffer: Buffer, originalname?: string, contentType?: string }} file
 * @param {string} folder
 * @param {string} [owner="user"]
 * @returns {Promise<string>}
 */
async function addImageFileToStorage(file, folder, owner = "user") {
  if (!env.AWS_BUCKET_NAME || !env.AWS_BUCKET_BASE_URL) {
    throw new Error("AWS bucket configuration is incomplete");
  }

  const ImageCollection = mongoose.model("ImageCollection");
  const imageRecord = await ImageCollection.create({});

  const extension = getFileExtension(file);
  const mimeType = getFileMime(file);
  const fileName = `${imageRecord._id}.${extension}`;
  const key = `${folder}/${fileName}`;
  const url = `${env.AWS_BUCKET_BASE_URL}/${key}`;

  await getS3Client().send(new PutObjectCommand({
    Bucket: env.AWS_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ACL: "public-read",
    ContentType: mimeType,
  }));

  const size = getFileSize(file);
  await ImageCollection.updateOne(
    { _id: imageRecord._id },
    {
      $set: {
        fileName,
        url,
        fileSize: size?.megabytes,
        mimeType,
        owner,
      },
    }
  );

  return url;
}

module.exports = {
  addImageFileToStorage,
  getFileSize,
};