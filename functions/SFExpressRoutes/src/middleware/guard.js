const { createErrorResponse } = require("../utils/response");

const BODY_REQUIRED_ROUTES = new Set([
  "POST /sf-express-routes/create-order",
  "POST /sf-express-routes/get-pickup-locations",
  "POST /sf-express-routes/get-token",
  "POST /sf-express-routes/get-area",
  "POST /sf-express-routes/get-netCode",
  "POST /v2/sf-express-routes/print-cloud-waybill",
]);

async function validateRequest({ event }) {
  const method = event.httpMethod?.toUpperCase();
  const routeKey = `${method} ${event.resource}`;

  let parsedBody = null;
  if (typeof event.body === "string" && event.body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch (_error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "others.invalidJSON", event),
      };
    }
  }

  if (BODY_REQUIRED_ROUTES.has(routeKey) && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  return {
    isValid: true,
    body: parsedBody,
  };
}

module.exports = { validateRequest };
