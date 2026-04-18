/**
 * Sanitizes an Order document for admin API responses.
 * Uses an explicit allowlist — any field not listed here is excluded by default.
 *
 * @param {object} order
 * @returns {object}
 */
function sanitizeOrder(order) {
  if (!order) return order;
  const raw = typeof order.toObject === "function" ? order.toObject() : { ...order };
  return {
    _id: raw._id,
    isPTagAir: raw.isPTagAir,
    lastName: raw.lastName,
    email: raw.email,
    phoneNumber: raw.phoneNumber,
    address: raw.address,
    paymentWay: raw.paymentWay,
    delivery: raw.delivery,
    tempId: raw.tempId,
    option: raw.option,
    type: raw.type,
    price: raw.price,
    petImg: raw.petImg,
    promotionCode: raw.promotionCode,
    shopCode: raw.shopCode,
    buyDate: raw.buyDate,
    petName: raw.petName,
    petContact: raw.petContact,
    sfWayBillNumber: raw.sfWayBillNumber,
    language: raw.language,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Sanitizes an OrderVerification document for admin API responses.
 * Uses an explicit allowlist — any field not listed here is excluded by default.
 *
 * @param {object} ov
 * @returns {object}
 */
function sanitizeOrderVerification(ov) {
  if (!ov) return ov;
  const raw = typeof ov.toObject === "function" ? ov.toObject() : { ...ov };
  return {
    _id: raw._id,
    tagId: raw.tagId,
    staffVerification: raw.staffVerification,
    cancelled: raw.cancelled,
    verifyDate: raw.verifyDate,
    petName: raw.petName,
    shortUrl: raw.shortUrl,
    masterEmail: raw.masterEmail,
    qrUrl: raw.qrUrl,
    petUrl: raw.petUrl,
    orderId: raw.orderId,
    pendingStatus: raw.pendingStatus,
    option: raw.option,
    type: raw.type,
    optionSize: raw.optionSize,
    optionColor: raw.optionColor,
    price: raw.price,
    discountProof: raw.discountProof,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Sanitizes a ShopInfo document before returning it in a public response.
 * Strips bank credentials from public-facing responses.
 *
 * @param {object} shopInfo
 * @returns {object}
 */
function sanitizeShopInfo(shopInfo) {
  if (!shopInfo) return shopInfo;
  const raw = typeof shopInfo.toObject === "function" ? shopInfo.toObject() : { ...shopInfo };
  const { __v, bankName, bankNumber, ...safe } = raw;
  return safe;
}

module.exports = { sanitizeOrder, sanitizeOrderVerification, sanitizeShopInfo };
