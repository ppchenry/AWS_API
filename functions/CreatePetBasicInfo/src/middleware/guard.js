const { createErrorResponse } = require("../utils/response");

async function validateRequest({ event }) {
  const method = event.httpMethod?.toUpperCase();
  let parsedBody = null;

  if (typeof event.body === "string" && event.body.trim().length > 0) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.invalidJSON", event),
      };
    }
  }

  if ((method === "POST" || method === "PUT") && (!parsedBody || Object.keys(parsedBody).length === 0)) {
    return {
      isValid: false,
      error: createErrorResponse(400, "common.missingParams", event),
    };
  }

  const cookieLang = event.cookies?.language;
  const bodyLang = typeof parsedBody?.lang === "string" ? parsedBody.lang.toLowerCase() : undefined;
  event.locale = cookieLang || bodyLang || event.queryStringParameters?.lang || "zh";

  return {
    isValid: true,
    body: parsedBody,
  };
}

module.exports = { validateRequest };