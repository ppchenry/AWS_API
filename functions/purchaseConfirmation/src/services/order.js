const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeOrder } = require("../utils/sanitize");

/**
 * GET /purchase/orders
 * Admin-protected — returns all orders.
 */
async function getOrders({ event }) {
  const scope = "services.order.getOrders";
  try {
    const queryParams = event.queryStringParameters || {};
    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(queryParams.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const Order = mongoose.model("Order");
    const projection = {
      isPTagAir: 1, lastName: 1, email: 1, phoneNumber: 1, address: 1,
      paymentWay: 1, delivery: 1, tempId: 1, option: 1, type: 1, price: 1,
      petImg: 1, promotionCode: 1, shopCode: 1, buyDate: 1, petName: 1,
      petContact: 1, sfWayBillNumber: 1, language: 1, createdAt: 1, updatedAt: 1,
    };
    const [orders, total] = await Promise.all([
      Order.find({}, projection).skip(skip).limit(limit).lean(),
      Order.countDocuments({}),
    ]);
    return createSuccessResponse(200, event, {
      orders: orders.map(sanitizeOrder),
      pagination: { page, limit, total },
    });
  } catch (error) {
    logError("getOrders failed", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { getOrders };
