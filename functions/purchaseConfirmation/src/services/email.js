const nodemailer = require("nodemailer");
const { ptagDetectionEmailSchema } = require("../zodSchema/emailSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logInfo, logError } = require("../utils/logger");
const { renderTemplate, escapeHtml } = require("../utils/template");

function createSmtpTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// ── Order confirmation email ──────────────────────────────────────────────────

function buildOrderConfirmationEmail(order, newOrderVerificationId) {
  const isPTagAir = order.option === "PTagAir" || order.option === "PTagAir_member";

  const productImageSrc = isPTagAir
    ? "https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68e37c919c1c33505d734e28/68e37e919c1c33505d734e33.png"
    : "https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68e37c919c1c33505d734e28/68e37c919c1c33505d734e2a.png";

  const optionNameMain = isPTagAir ? "Ptag" : order.option;
  const optionNameSuffixHtml = isPTagAir
    ? ' <span style="color:#65A8FB; font-weight:400;">Air</span>'
    : "";

  const optionSizeRowHtml = order.optionSize
    ? `<tr><td style="color:#969696; font-size:18px;"><img src="https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68de55a8d0f07572c59344be/68e6640b0dea8b9a98db1558.png" alt="Check" width="20" height="20" style="display:inline;" /> ${escapeHtml(order.optionSize)} 毫米</td></tr>`
    : "";

  const printContentLabel = isPTagAir ? "Ptag Air" : "Ptag";
  const unitPrice = typeof order.price === "number" ? order.price : parseFloat(order.price) || 0;
  const totalPrice = unitPrice + 50;
  const petImageSrc =
    order.petImg ||
    "https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68e37c919c1c33505d734e28/68e37ec59c1c33505d734e38.png";

  const confirmationLink = `https://www.ptag.com.hk/ptag-air/confirmation?qr=${newOrderVerificationId}`;

  return renderTemplate("order-confirmation-email.html", {
    ORDER_ID: order.tempId,
    OPTION_DISPLAY: isPTagAir ? "PTagAir" : order.option,
    PRODUCT_IMAGE_SRC: productImageSrc,
    OPTION_NAME_MAIN: optionNameMain,
    OPTION_NAME_SUFFIX_HTML: optionNameSuffixHtml,
    OPTION_SIZE_ROW_HTML: optionSizeRowHtml,
    OPTION_COLOR_VALUE: order.optionColor || "白色",
    PRINT_CONTENT_LABEL: printContentLabel,
    PET_NAME: order.petName,
    PET_IMAGE_SRC: petImageSrc,
    LAST_NAME: order.lastName,
    PHONE_NUMBER: order.phoneNumber || "",
    DELIVERY: order.delivery,
    ADDRESS: order.address,
    PAYMENT_WAY: order.paymentWay,
    UNIT_PRICE: String(unitPrice),
    TOTAL_PRICE: String(totalPrice),
    CONFIRMATION_LINK: confirmationLink,
  });
}

/**
 * Sends a purchase order confirmation email to the customer.
 * Non-fatal — caller wraps in try/catch.
 */
async function sendOrderEmail(to, subject, order, cc, newOrderVerificationId) {
  const html = buildOrderConfirmationEmail(order, newOrderVerificationId);
  await createSmtpTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    cc,
    subject,
    html,
  });
}

// ── WhatsApp notification ─────────────────────────────────────────────────────

/**
 * Sends a WhatsApp template message to the customer after order creation.
 * Non-fatal — caller wraps in try/catch.
 */
async function sendWhatsAppOrderMessage(order, newOrderVerificationId) {
  const { phoneNumber, lastName, option, tempId, lang } = order;
  if (!phoneNumber) return;

  const data = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: `+852${phoneNumber}`,
    type: "template",
    template: {
      name: lang === "chn" ? "ptag_order_chn" : "ptag_order_eng",
      language: { code: lang === "chn" ? "zh_CN" : "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: lastName },
            { type: "text", text: option === "PTagAir" ? "Ptag Air" : "PTag" },
            { type: "text", text: tempId },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: String(newOrderVerificationId) }],
        },
      ],
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.WHATSAPP_BEARER_TOKEN,
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${errorBody}`);
  }
}

// ── PTag detection email (admin route handler) ────────────────────────────────

/**
 * POST /purchase/send-ptag-detection-email
 * Admin-protected — sends a PTag detection location alert to the pet owner.
 */
async function sendPtagDetectionEmail({ event, body }) {
  const scope = "services.email.sendPtagDetectionEmail";
  try {
    const parseResult = ptagDetectionEmailSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error, "email.errors.missingFields"), event);
    }

    const { name, tagId, dateTime, locationURL, email } = parseResult.data;

    const html = renderTemplate("ptag-detection-email.html", {
      PET_NAME: name,
      TAG_ID: tagId,
      DATE_TIME: dateTime,
      LOCATION_URL: locationURL,
    });

    await createSmtpTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      cc: "notification@ptag.com.hk",
      subject: `PTag | 您的寵物 ${name} (${tagId}) 最新位置更新 | Your pet ${name} (${tagId}) Latest location update`,
      html,
    });

    logInfo("PTag detection email sent", { scope, event, extra: { tagId, recipientEmail: email } });
    return createSuccessResponse(200, event, { message: "Email sent successfully." });
  } catch (error) {
    logError("sendPtagDetectionEmail failed", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { sendOrderEmail, sendWhatsAppOrderMessage, sendPtagDetectionEmail };

