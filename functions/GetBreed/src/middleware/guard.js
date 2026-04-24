const { createErrorResponse } = require("../utils/response");

const BODY_REQUIRED_ROUTES = new Set(["POST /product/productLog"]);

async function validateGetBreedRequest({ event }) {
  const routeKey = `${event.httpMethod} ${event.resource}`;
  let body = null;

  const lang = event.pathParameters?.lang;
  if (lang) {
    event.locale = lang === "en" ? "en" : "zh";
  } else {
    event.locale = "zh";
  }

  if (typeof event.body === "string" && event.body.trim() !== "") {
    try {
      body = JSON.parse(event.body);
    } catch (_error) {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.invalidJSON", event),
      };
    }
  }

  if (BODY_REQUIRED_ROUTES.has(routeKey)) {
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.missingParams", event),
      };
    }

    if (!body.petId || !body.userId || !body.userEmail || !body.productUrl) {
      return {
        isValid: false,
        error: createErrorResponse(400, "common.missingParams", event),
      };
    }
  }

  if (routeKey === "GET /animal/animalList/{lang}") {
    if (!lang) {
      return {
        isValid: false,
        error: createErrorResponse(400, "getBreed.errors.missingLanguage", event),
      };
    }
  }

  if (routeKey === "GET /analysis/{eyeDiseaseName}") {
    const eyeDiseaseName = event.pathParameters?.eyeDiseaseName;
    if (!eyeDiseaseName) {
      return {
        isValid: false,
        error: createErrorResponse(400, "getBreed.errors.missingEyeDiseaseName", event),
      };
    }
  }

  return {
    isValid: true,
    body,
  };
}

module.exports = { validateGetBreedRequest };
