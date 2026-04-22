const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logInfo, logError } = require("../utils/logger");
const { sanitizeOrderVerification } = require("../utils/sanitize");

/**
 * GET /purchase/order-verification
 * Admin-protected — returns all order verifications.
 */
async function getOrderVerifications({ event }) {
  const scope = "services.orderVerification.getOrderVerifications";
  try {
    const queryParams = event.queryStringParameters || {};
    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(queryParams.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const OrderVerification = mongoose.model("OrderVerification");
    const projection = {
      tagId: 1, staffVerification: 1, cancelled: 1, verifyDate: 1, petName: 1,
      shortUrl: 1, masterEmail: 1, qrUrl: 1, petUrl: 1, orderId: 1,
      pendingStatus: 1, option: 1, type: 1, optionSize: 1, optionColor: 1,
      price: 1, discountProof: 1, createdAt: 1, updatedAt: 1,
    };
    const [records, total] = await Promise.all([
      OrderVerification.find({}, projection).skip(skip).limit(limit).lean(),
      OrderVerification.countDocuments({}),
    ]);
    return createSuccessResponse(200, event, {
      orderVerification: records.map(sanitizeOrderVerification),
      pagination: { page, limit, total },
    });
  } catch (error) {
    logError("getOrderVerifications failed", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * DELETE /purchase/order-verification/{orderVerificationId}
 * Admin-protected — soft-cancels a single order verification by ID.
 * Sets cancelled=true; does not remove the document from the collection.
 * ObjectId format is validated by guard.js before this service is called.
 */
async function deleteOrderVerification({ event }) {
  const scope = "services.orderVerification.deleteOrderVerification";
  try {
    const orderVerificationId = event.pathParameters?.orderVerificationId;

    const OrderVerification = mongoose.model("OrderVerification");

    // Distinguish "not found" from "already cancelled" for idempotency
    const existing = await OrderVerification.findOne(
      { _id: orderVerificationId },
      { _id: 1, cancelled: 1 }
    ).lean();

    if (!existing) {
      return createErrorResponse(404, "purchaseConfirmation.errors.purchase.orderVerificationNotFound", event);
    }
    if (existing.cancelled) {
      return createErrorResponse(409, "purchaseConfirmation.errors.purchase.alreadyCancelled", event);
    }

    await OrderVerification.updateOne(
      { _id: orderVerificationId },
      { $set: { cancelled: true } }
    );

    logInfo("OrderVerification cancelled (soft delete)", {
      scope,
      event,
      extra: { orderVerificationId },
    });

    return createSuccessResponse(200, event, {
      message: "Cancelled successfully.",
      orderVerificationId,
    });
  } catch (error) {
    logError("deleteOrderVerification failed", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { getOrderVerifications, deleteOrderVerification };
