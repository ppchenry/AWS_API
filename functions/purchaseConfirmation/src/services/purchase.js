const mongoose = require("mongoose");
const { parse } = require("lambda-multipart-parser");
const { purchaseConfirmationSchema } = require("../zodSchema/purchaseSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logInfo, logError } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");
const { addImageFileToStorage, uploadQrCodeImage } = require("../utils/s3");
const {
  normalizeEmail,
  validateUploadFiles,
  generateUniqueTagId,
  resolveCanonicalPrice,
  resolveShortUrl,
  createOrder,
  createOrderVerification,
} = require("./purchaseHelpers");
const { sendOrderEmail, sendWhatsAppOrderMessage } = require("./email");

/**
 * POST /purchase/confirmation
 * Public route — guest checkout. Accepts multipart/form-data.
 */
async function submitPurchaseConfirmation({ event }) {
  const scope = "services.purchase.submitPurchaseConfirmation";
  try {
    // 1. Rate limit (public write flow)
    const rateLimit = await enforceRateLimit({
      event,
      action: "submit-order",
      limit: 10,
      windowSec: 3600,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // 2. Parse multipart form data
    const parsed = await parse(event, true);

    // 3. Zod validation
    const parseResult = purchaseConfirmationSchema.safeParse(parsed);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error, "purchaseConfirmation.errors.purchase.missingRequiredFields"), event);
    }

    const {
      lastName, phoneNumber, address, email: rawEmail, option, type, tempId,
      paymentWay, shopCode, delivery, promotionCode, petContact,
      petName, optionSize, optionColor, lang,
    } = parseResult.data;

    const email = normalizeEmail(rawEmail);

    // 4. Validate and upload image files
    const petImgFiles = (parsed.files || []).filter((f) => f.fieldname === "pet_img");
    const discountProofFiles = (parsed.files || []).filter((f) => f.fieldname === "discount_proof");

    const fileError = validateUploadFiles(petImgFiles) || validateUploadFiles(discountProofFiles);
    if (fileError) {
      return createErrorResponse(400, fileError, event);
    }

    let petImgUrl = "";
    if (petImgFiles.length > 0) {
      const urls = await Promise.all(
        petImgFiles.map((f) =>
          addImageFileToStorage(
            { buffer: f.content, originalname: f.filename },
            `user-uploads/orders/${tempId}`,
            "user"
          )
        )
      );
      petImgUrl = urls[0] || "";
    }

    let discountProofUrl = "";
    if (discountProofFiles.length > 0) {
      const urls = await Promise.all(
        discountProofFiles.map((f) =>
          addImageFileToStorage(
            { buffer: f.content, originalname: f.filename },
            `user-uploads/orders/${tempId}/discount-proofs`,
            "user"
          )
        )
      );
      discountProofUrl = urls[0] || "";
    }

    // 5. Duplicate tempId guard
    const Order = mongoose.model("Order");
    if (await Order.findOne({ tempId }, { _id: 1 }).lean()) {
      return createErrorResponse(409, "purchaseConfirmation.errors.purchase.duplicateOrder", event);
    }

    // 6. Resolve canonical price (server-authoritative — shopCode is required)
    const priceResult = await resolveCanonicalPrice({ shopCode });
    if (!priceResult) {
      return createErrorResponse(400, "purchaseConfirmation.errors.purchase.invalidShopCode", event);
    }
    const { canonicalPrice } = priceResult;

    // 7. Create Order
    const isPTagAir = option === "PTagAir" || option === "PTagAir_member";
    let order;
    try {
      order = await createOrder({
        lastName, phoneNumber, address, email, option, type, tempId,
        petImgUrl, paymentWay, shopCode, delivery, canonicalPrice,
        promotionCode, petContact, petName, isPTagAir, lang,
      });
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return createErrorResponse(409, "purchaseConfirmation.errors.purchase.duplicateOrder", event);
      }
      throw saveErr;
    }

    // 8–10. Generate tag data, QR assets, and OrderVerification.
    //       If any step fails after Order is committed, compensate by removing the Order.
    let savedVerification;
    let tagId;
    try {
      // 8. Generate unique tagId (retry on rare DB-level collision)
      const TAG_ID_MAX_RETRIES = 3;
      let tagIdAttempt = 0;
      while (true) {
        tagId = await generateUniqueTagId();

        // 9. Generate QR / short URL
        const shortUrl = await resolveShortUrl(order, tagId);
        const qrUrl = isPTagAir
          ? `${process.env.AWS_BUCKET_BASE_URL}/pet-images/ptag+id.png`
          : await uploadQrCodeImage(shortUrl);

        // 10. Create OrderVerification
        try {
          savedVerification = await createOrderVerification({
            tagId, phoneNumber, buyDate: order.buyDate, petName, email, shortUrl,
            qrUrl, petImgUrl, tempId, address, lastName, option, type,
            optionSize, optionColor, canonicalPrice, discountProofUrl,
          });
          break; // success — exit retry loop
        } catch (ovErr) {
          if (ovErr.code === 11000 && ++tagIdAttempt < TAG_ID_MAX_RETRIES) {
            continue; // tagId collision — retry with a new tagId
          }
          throw ovErr;
        }
      }
    } catch (postOrderErr) {
      // Compensate: remove the dangling Order so the user can retry
      try {
        await Order.deleteOne({ _id: order._id });
      } catch (cleanupErr) {
        logError("Failed to rollback Order after post-order failure", { scope, event, error: cleanupErr });
      }
      throw postOrderErr;
    }
    const newOrderVerificationId = savedVerification._id;

    // 11. Send confirmation email (non-fatal — state is already committed)
    try {
      await sendOrderEmail(
        email,
        `PTag 訂單資料：${tempId}`,
        {
          lastName, phoneNumber, address, email, option, type, tempId,
          petImg: petImgUrl, paymentWay, shopCode, delivery, price: canonicalPrice,
          promotionCode, petContact, petName, optionColor, optionSize, isPTagAir,
        },
        "support@ptag.com.hk",
        newOrderVerificationId
      );
    } catch (emailError) {
      logError("Order confirmation email failed (non-fatal)", { scope, event, error: emailError });
    }

    // 12. Send WhatsApp notification (non-fatal)
    try {
      await sendWhatsAppOrderMessage(
        { phoneNumber, lastName, option, tempId, lang },
        newOrderVerificationId
      );
    } catch (waError) {
      logError("WhatsApp notification failed (non-fatal)", { scope, event, error: waError });
    }

    logInfo("Purchase order created", {
      scope,
      event,
      extra: { tempId, tagId, orderVerificationId: String(newOrderVerificationId) },
    });

    return createSuccessResponse(200, event, {
      message: "Order placed successfully.",
      purchase_code: tempId,
      price: canonicalPrice,
      _id: newOrderVerificationId,
    });
  } catch (error) {
    if (error.code === "INVALID_FILE_TYPE") {
      return createErrorResponse(400, "purchaseConfirmation.errors.purchase.invalidFileType", event);
    }
    if (error.code === "FILE_TOO_LARGE") {
      return createErrorResponse(400, "purchaseConfirmation.errors.purchase.fileTooLarge", event);
    }
    logError("submitPurchaseConfirmation failed", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { submitPurchaseConfirmation };
