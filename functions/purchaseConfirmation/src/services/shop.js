const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { sanitizeShopInfo } = require("../utils/sanitize");
const { logError } = require("../utils/logger");

/**
 * GET /purchase/shop-info
 * Public route — returns all shop info (bank details stripped for public responses).
 */
async function getShopInfo({ event }) {
  const scope = "services.shop.getShopInfo";
  try {
    const ShopInfo = mongoose.model("ShopInfo");
    const shops = await ShopInfo.find(
      {},
      { shopCode: 1, shopName: 1, shopAddress: 1, shopContact: 1, shopContactPerson: 1, price: 1 }
    ).lean();
    return createSuccessResponse(200, event, {
      shopInfo: shops.map(sanitizeShopInfo),
    });
  } catch (error) {
    logError("getShopInfo failed", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { getShopInfo };
