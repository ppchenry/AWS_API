const mongoose = require("mongoose");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3");
const { logError } = require("../utils/logger");

const BASE_URL = process.env.AWS_BUCKET_BASE_URL;
const BUCKET = process.env.AWS_BUCKET_NAME;

const MAX_FILE_SIZE_MB = 10;

/** @type {import("mime")} */
let _mime;

/**
 * Dynamically imports the ESM-only `mime` package.
 * @returns {Promise<import("mime")>}
 */
async function getMime() {
  if (!_mime) {
    _mime = (await import("mime")).default;
  }
  return _mime;
}

/**
 * Gets file MIME type from originalname.
 */
async function getFileMime(file) {
  const mime = await getMime();
  return mime.getType(file.originalname);
}

/**
 * Gets file size in bytes, KB, MB.
 */
function getFileSize(file) {
  try {
    const fileSizeInBytes = file.buffer.length;
    return {
      bytes: fileSizeInBytes,
      kilobytes: fileSizeInBytes / 1024,
      megabytes: fileSizeInBytes / (1024 * 1024),
    };
  } catch (error) {
    logError("Error getting file size", {
      scope: "services.imageUpload.getFileSize",
      error,
    });
    return null;
  }
}

/**
 * Gets file extension from originalname.
 */
function getFileExtension(file) {
  return file.originalname.split(".").pop();
}

/**
 * Uploads an image file to S3 and records it in ImageCollection.
 *
 * @param {Object} image - { buffer, originalname }
 * @param {string} folder - S3 folder path
 * @param {string} [owner="user"]
 * @returns {Promise<string|undefined>} The public URL of the uploaded image.
 */
async function addImageFileToStorage(image, folder, owner = "user") {
  try {
    const ImageCollection = mongoose.model("ImageCollection");
    const mimeType = await getFileMime(image);
    const size = getFileSize(image);
    const ext = getFileExtension(image);

    // Reject oversized files
    if (size && size.megabytes > MAX_FILE_SIZE_MB) {
      logError("File exceeds size limit", {
        scope: "services.imageUpload.addImageFileToStorage",
        extra: { sizeMB: size.megabytes, limit: MAX_FILE_SIZE_MB },
      });
      return undefined;
    }

    const img = await ImageCollection.create({});
    const fileName = `${img._id}.${ext}`;
    const url = `${BASE_URL}/${folder}/${fileName}`;
    const params = {
      Bucket: BUCKET,
      Key: `${folder}/${fileName}`,
      Body: image.buffer,
      ACL: "public-read",
      ContentType: mimeType || "application/octet-stream",
    };
    await s3Client.send(new PutObjectCommand(params));

    await ImageCollection.updateOne(
      { _id: img._id },
      {
        fileName: fileName,
        url: url,
        fileSize: size ? size.megabytes : 0,
        mimeType: mimeType,
        owner: owner,
      }
    );

    return url;
  } catch (error) {
    logError("Error uploading image to S3", {
      scope: "services.imageUpload.addImageFileToStorage",
      error,
    });
    return undefined;
  }
}

/**
 * Generates the next serial number by finding the max across PetLost and PetFound.
 *
 * @returns {Promise<string>} The next serial number as a string.
 */
async function getNextSerialNumber() {
  const PetLost = mongoose.model("PetLost");
  const PetFound = mongoose.model("PetFound");

  const [lastLostPet, lastFoundPet] = await Promise.all([
    PetLost.findOne({})
      .sort({ serial_number: -1 })
      .select("serial_number")
      .lean(),
    PetFound.findOne({})
      .sort({ serial_number: -1 })
      .select("serial_number")
      .lean(),
  ]);

  let maxNumber = 0;
  if (lastLostPet && lastLostPet.serial_number) {
    maxNumber = Math.max(maxNumber, Number(lastLostPet.serial_number) || 0);
  }
  if (lastFoundPet && lastFoundPet.serial_number) {
    maxNumber = Math.max(maxNumber, Number(lastFoundPet.serial_number) || 0);
  }

  return (maxNumber + 1).toString();
}

module.exports = {
  addImageFileToStorage,
  getNextSerialNumber,
};
