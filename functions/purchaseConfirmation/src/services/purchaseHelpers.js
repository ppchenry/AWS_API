const mongoose = require("mongoose");
const axios = require("axios");
const { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, detectMimeFromBuffer } = require("../utils/s3");

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : email;

const ALPHABET = "ACDEFGHJKLMNPQRTUVWXYZ";
const NUMBERS = "23456789";

// ── File validation ──────────────────────────────────────────────────────────

/**
 * Validates a list of uploaded files against MIME allowlist and size limit.
 * Returns a locale key string on the first violation, or null if all files are valid.
 *
 * @param {Array<{ content: Buffer }>} files
 * @param {number} [maxCount=1]
 * @returns {string|null}
 */
function validateUploadFiles(files, maxCount = 1) {
  if (files.length > maxCount) return "purchaseConfirmation.errors.purchase.tooManyFiles";
  for (const f of files) {
    if (f.content.length > MAX_UPLOAD_BYTES) return "purchaseConfirmation.errors.purchase.fileTooLarge";
    const detectedMime = detectMimeFromBuffer(f.content);
    if (!detectedMime || !ALLOWED_UPLOAD_MIME.has(detectedMime)) return "purchaseConfirmation.errors.purchase.invalidFileType";
  }
  return null;
}

// ── Tag ID ───────────────────────────────────────────────────────────────────

function _pick(chars) {
  return chars[Math.floor(Math.random() * chars.length)];
}

function _generateTagId() {
  return (
    _pick(ALPHABET) +
    _pick(NUMBERS) +
    _pick(ALPHABET) +
    _pick(NUMBERS) +
    _pick(ALPHABET) +
    _pick(NUMBERS)
  );
}

/**
 * Generates a tagId that is guaranteed unique within the OrderVerification collection.
 * Loops until a collision-free value is found.
 *
 * @returns {Promise<string>}
 */
async function generateUniqueTagId() {
  const OrderVerification = mongoose.model("OrderVerification");
  let tagId;
  do {
    tagId = _generateTagId();
  } while (await OrderVerification.findOne({ tagId }, { _id: 1 }).lean());
  return tagId;
}

// ── Pricing ──────────────────────────────────────────────────────────────────

/**
 * Resolves the canonical price.
 * If shopCode is provided, looks up the server-authoritative price from ShopInfo.
 * Returns null if shopCode is unrecognised.
 *
 * @param {{ shopCode?: string, price?: string|number }} params
 * @returns {Promise<{ canonicalPrice: number }|null>} null signals a 400 (invalid shopCode)
 */
async function resolveCanonicalPrice({ shopCode }) {
  if (!shopCode) return null; // caller should return 400 — price must come from a server-owned source
  const ShopInfo = mongoose.model("ShopInfo");
  const shop = await ShopInfo.findOne({ shopCode }, { price: 1 }).lean();
  if (!shop) return null; // caller should return 400
  const canonicalPrice = typeof shop.price === "number" ? shop.price : parseFloat(shop.price) || 0;
  return { canonicalPrice };
}

// ── URL shortening ────────────────────────────────────────────────────────────

/**
 * @param {string} longUrl
 * @returns {Promise<string>}
 */
async function shortenUrl(longUrl) {
  const apiKey = process.env.CUTTLY_API_KEY;
  if (!apiKey) return longUrl;
  try {
    const response = await axios.get("https://cutt.ly/api/api.php", {
      params: { key: apiKey, short: longUrl },
    });
    if (response.data?.url?.shortLink) return response.data.url.shortLink;
    return longUrl;
  } catch {
    return longUrl;
  }
}

/**
 * Returns the short URL for a tag's QR code.
 *
 * @param {object} order
 * @param {string} tagId
 * @returns {Promise<string>}
 */
async function resolveShortUrl(order, tagId) {
  if (order.isPTagAir) return "www.ptag.com.hk/landing";
  return shortenUrl(`https://www.ptag.com.hk/php/qr_info.php?qr=${tagId}`);
}

// ── Persistence ───────────────────────────────────────────────────────────────

/**
 * Constructs and saves a new Order document.
 *
 * @param {object} fields
 * @returns {Promise<import("mongoose").Document>}
 */
async function createOrder(fields) {
  const Order = mongoose.model("Order");
  const order = new Order({
    lastName: fields.lastName,
    phoneNumber: fields.phoneNumber,
    address: fields.address,
    email: fields.email,
    option: fields.option,
    type: fields.type,
    tempId: fields.tempId,
    petImg: fields.petImgUrl,
    paymentWay: fields.paymentWay,
    shopCode: fields.shopCode,
    delivery: fields.delivery,
    price: fields.canonicalPrice,
    promotionCode: fields.promotionCode,
    petContact: fields.petContact,
    petName: fields.petName,
    buyDate: new Date(),
    isPTagAir: fields.isPTagAir,
    sfWayBillNumber: null,
    language: fields.lang,
  });
  await order.save();
  return order;
}

/**
 * Constructs and saves a new OrderVerification document.
 *
 * @param {object} fields
 * @returns {Promise<import("mongoose").Document>}
 */
async function createOrderVerification(fields) {
  const OrderVerification = mongoose.model("OrderVerification");
  const ov = new OrderVerification({
    tagId: fields.tagId,
    staffVerification: false,
    contact: fields.phoneNumber,
    verifyDate: null,
    tagCreationDate: fields.buyDate,
    petName: fields.petName,
    masterEmail: fields.email,
    shortUrl: fields.shortUrl,
    qrUrl: fields.qrUrl,
    petUrl: fields.petImgUrl,
    orderId: fields.tempId,
    location: fields.address,
    petHuman: fields.lastName,
    pendingStatus: false,
    option: fields.option,
    type: fields.type,
    optionSize: fields.optionSize,
    optionColor: fields.optionColor,
    price: fields.canonicalPrice,
    discountProof: fields.discountProofUrl,
    cancelled: false,
  });
  await ov.save();
  return ov;
}

module.exports = {
  normalizeEmail,
  validateUploadFiles,
  generateUniqueTagId,
  resolveCanonicalPrice,
  shortenUrl,
  resolveShortUrl,
  createOrder,
  createOrderVerification,
};
