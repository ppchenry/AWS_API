const mongoose = require("mongoose");
const { createErrorResponse } = require("../utils/response");

/**
 * Routes that require admin role.
 * Checked after JWT auth has already attached event.userRole.
 */
const ADMIN_ONLY_RESOURCES = new Set([
  "/purchase/orders",
  "/purchase/order-verification",
  "/purchase/order-verification/{orderVerificationId}",
  "/purchase/send-ptag-detection-email",
]);

/**
 * Routes requiring a JSON body (multipart routes are excluded intentionally).
 */
const BODY_REQUIRED_ROUTES = new Set([
  "POST /purchase/send-ptag-detection-email",
]);

/**
 * Validates the incoming request before DB connection.
 * Handles: JSON parse, empty body check, RBAC, path param ObjectId validation.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent }} opts
 * @returns {{ isValid: boolean, error?: object, body?: object | null }}
 */
async function validatePurchaseRequest({ event }) {
  const { body, httpMethod } = event;
  const method = httpMethod?.toUpperCase();
  const routeKey = `${method} ${event.resource}`;
  const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";
  const isMultipart = contentType.includes("multipart/form-data");

  // 1. RBAC — admin-only resource check
  if (ADMIN_ONLY_RESOURCES.has(event.resource)) {
    const role = event.userRole;
    if (role !== "admin" && role !== "developer") {
      return {
        isValid: false,
        error: createErrorResponse(403, "common.unauthorized", event),
      };
    }
  }

  // 2. JSON body parse (skip for multipart)
  let parsedBody = null;
  if (!isMultipart && typeof body === "string" && body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.invalidJSON", event),
      };
    }
  }

  // 3. Empty body check for routes that require one
  if (
    BODY_REQUIRED_ROUTES.has(routeKey) &&
    (!parsedBody || Object.keys(parsedBody).length === 0)
  ) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.missingParams", event),
    };
  }

  // 4. ObjectId path param validation
  const orderVerificationId = event.pathParameters?.orderVerificationId;
  if (orderVerificationId && !mongoose.isValidObjectId(orderVerificationId)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.invalidObjectId", event),
    };
  }

  return { isValid: true, body: parsedBody };
}

module.exports = { validatePurchaseRequest };
