const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mongoose = require("mongoose");
const { logError } = require("./logger");

const s3Client = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWSACCESSID,
    secretAccessKey: process.env.AWSSECRETKEY,
  },
});

const BASE_URL = process.env.AWS_BUCKET_BASE_URL;
const BUCKET = process.env.AWS_BUCKET_NAME;

const ALLOWED_UPLOAD_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Detects MIME type by reading magic bytes from the buffer.
 * Returns null if the signature is unrecognised.
 *
 * @param {Buffer} buffer
 * @returns {string|null}
 */
function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "image/png";
  // GIF87a / GIF89a
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) return "image/gif";
  // WebP: RIFF????WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "image/webp";
  return null;
}

/**
 * Uploads a file buffer to S3 and records the upload in ImageCollection.
 * The DB connection must already be established before calling this function.
 *
 * @param {{ buffer: Buffer, originalname: string }} file
 * @param {string} folder - S3 folder path (e.g. "user-uploads/orders/TEMPID")
 * @param {string} [owner="user"]
 * @returns {Promise<string>} Public URL of the uploaded file
 */
async function addImageFileToStorage(file, folder, owner = "user") {
  const detectedMime = detectMimeFromBuffer(file.buffer);

  if (!detectedMime || !ALLOWED_UPLOAD_MIME.has(detectedMime)) {
    const err = new Error("Unsupported file type");
    err.code = "INVALID_FILE_TYPE";
    throw err;
  }
  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    const err = new Error("File exceeds maximum allowed size");
    err.code = "FILE_TOO_LARGE";
    throw err;
  }

  const mimeType = detectedMime;
  const extMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  const ext = extMap[mimeType] || "bin";

  const ImageCollection = mongoose.model("ImageCollection");
  const img = await ImageCollection.create({});

  const fileName = `${img._id}.${ext}`;
  const url = `${BASE_URL}/${folder}/${fileName}`;

  const params = {
    Bucket: BUCKET,
    Key: `${folder}/${fileName}`,
    Body: file.buffer,
    ACL: "public-read",
    // NOTE: Objects are made public-read for direct CDN linking.
    // Content scanning / image transformation is a deferred infra-level concern.
    ContentType: mimeType,
  };

  await s3Client.send(new PutObjectCommand(params));

  await ImageCollection.updateOne(
    { _id: img._id },
    {
      fileName,
      url,
      fileSize: file.buffer.length / (1024 * 1024),
      mimeType,
      owner,
    }
  );

  return url;
}

/**
 * Downloads a QR code image from the external API, uploads it to S3,
 * and returns the hosted URL.
 *
 * Falls back to the direct API URL if upload fails.
 *
 * @param {string} shortUrl - The URL to encode in the QR code
 * @returns {Promise<string>} URL of the QR code image
 */
async function uploadQrCodeImage(shortUrl) {
  const axios = require("axios");
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shortUrl)}`;

  try {
    const response = await axios.get(qrApiUrl, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(response.data, "binary");

    const ImageCollection = mongoose.model("ImageCollection");
    const img = await ImageCollection.create({});
    const fileName = `${img._id}.png`;
    const url = `${BASE_URL}/qr-codes/${fileName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `qr-codes/${fileName}`,
        Body: imageBuffer,
        ACL: "public-read",
        ContentType: "image/png",
      })
    );

    await ImageCollection.updateOne(
      { _id: img._id },
      {
        fileName,
        url,
        fileSize: imageBuffer.length / (1024 * 1024),
        mimeType: "image/png",
        owner: "system",
      }
    );

    return url;
  } catch (error) {
    logError("QR code upload failed, falling back to direct API URL", {
      scope: "utils.s3.uploadQrCodeImage",
      error,
    });
    return qrApiUrl;
  }
}

module.exports = { addImageFileToStorage, uploadQrCodeImage, detectMimeFromBuffer };
