const { createErrorResponse } = require("../utils/response");
const { isValidObjectId } = require("../utils/validators");

async function validateRequest({ event }) {
  const method = event.httpMethod?.toUpperCase();
  let parsedBody = null;

  if (typeof event.body === "string" && event.body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "invalidJSON", event),
      };
    }
  }

  if ((method === "POST" || method === "PUT") && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "others.missingParams", event),
    };
  }

  const cookieLang = event.cookies?.language;
  const bodyLang = typeof parsedBody?.lang === "string" ? parsedBody.lang.toLowerCase() : undefined;
  event.locale = cookieLang || bodyLang || event.queryStringParameters?.lang || "zh";

  if (parsedBody?.userId !== undefined && parsedBody?.userId !== null) {
    if (typeof parsedBody.userId !== "string" || !isValidObjectId(parsedBody.userId)) {
      return {
        isValid: false,
        error: createErrorResponse(400, "invalidUserIdFormat", event),
      };
    }

    if (String(parsedBody.userId) !== String(event.userId)) {
      return {
        isValid: false,
        error: createErrorResponse(403, "others.unauthorized", event),
      };
    }
  }

  return {
    isValid: true,
    body: parsedBody,
  };
}

module.exports = { validateRequest };