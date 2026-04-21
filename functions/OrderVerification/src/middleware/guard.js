const { createErrorResponse } = require("../utils/response");
const { isValidObjectId } = require("../utils/validators");

const BODY_REQUIRED_ROUTES = new Set([
  "PUT /v2/orderVerification/{tagId}",
]);

async function validateOrderVerificationRequest({ event }) {
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const method = event.httpMethod?.toUpperCase();

  let parsedBody = null;
  if (typeof event.body === "string" && event.body.trim().length > 0) {
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
    && (!parsedBody || Object.keys(parsedBody).length === 0)
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
