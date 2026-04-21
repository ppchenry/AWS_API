const { createErrorResponse } = require("../utils/response");
const { isValidObjectId } = require("../utils/validators");

const BODY_REQUIRED_ROUTES = new Set([
  "PUT /v2/orderVerification/supplier/{orderId}",
  "PUT /v2/orderVerification/{tagId}",
]);

/**
 * Detects multipart requests so the guard does not break raw form-data bodies.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {boolean}
 */
function isMultipartRequest(event) {
  const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"];
  return typeof contentType === "string" && contentType.toLowerCase().includes("multipart/form-data");
}

/**
 * Performs cheap request validation before the DB-backed service layer runs.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} args
 * @returns {Promise<{ isValid: boolean, error?: import("aws-lambda").APIGatewayProxyResult, body?: Record<string, any>|null }>}
 */
async function validateOrderVerificationRequest({ event }) {
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const method = event.httpMethod?.toUpperCase();

  let parsedBody = null;
  if (!isMultipartRequest(event) && typeof event.body === "string" && event.body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch (error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "others.invalidJSON", event),
      };
    }
  }

  if (
    (method === "POST" || method === "PUT")
    && BODY_REQUIRED_ROUTES.has(routeKey)
    && (
      (isMultipartRequest(event) && (!event.body || String(event.body).trim().length === 0))
      || (!isMultipartRequest(event) && (!parsedBody || Object.keys(parsedBody).length === 0))
    )
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  if (event.resource === "/v2/orderVerification/whatsapp-order-link/{_id}") {
    const verificationId = event.pathParameters?._id;
    if (!verificationId) {
      return {
        isValid: false,
        error: createErrorResponse(400, "orderVerification.errors.missingVerificationId", event),
      };
    }

    if (!isValidObjectId(verificationId)) {
      return {
        isValid: false,
        error: createErrorResponse(400, "orderVerification.errors.invalidVerificationId", event),
      };
    }
  }

  return {
    isValid: true,
    body: parsedBody,
  };
}

module.exports = { validateOrderVerificationRequest };
