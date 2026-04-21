const { createErrorResponse } = require("../utils/response");
const { isValidObjectId, normalizeCsvValues, parsePositiveInteger } = require("../utils/validators");

async function validateAdoptionRequest({ event }) {
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const queryParams = event.queryStringParameters || {};
  const locale = typeof queryParams.lang === "string" ? queryParams.lang : "zh";

  event.locale = locale;

  if (routeKey === "GET /adoption/{id}") {
    const id = event.pathParameters?.id;

    if (!id || !isValidObjectId(id)) {
      return {
        isValid: false,
        error: createErrorResponse(400, "adoption.invalidPetIdFormat", event),
      };
    }

    return {
      isValid: true,
      query: { id },
    };
  }

  if (routeKey === "GET /adoption") {
    const page = parsePositiveInteger(queryParams.page);
    if (queryParams.page !== undefined && page === null) {
      return {
        isValid: false,
        error: createErrorResponse(400, "adoption.invalidPage", event),
      };
    }

    const search = typeof queryParams.search === "string" ? queryParams.search.trim() : "";
    if (search.length > 100) {
      return {
        isValid: false,
        error: createErrorResponse(400, "adoption.invalidSearch", event),
      };
    }

    return {
      isValid: true,
      query: {
        page: page || 1,
        search,
        animalTypes: normalizeCsvValues(queryParams.animal_type),
        locations: normalizeCsvValues(queryParams.location),
        sexes: normalizeCsvValues(queryParams.sex),
        ages: normalizeCsvValues(queryParams.age),
      },
    };
  }

  return {
    isValid: true,
    query: {},
  };
}

module.exports = { validateAdoptionRequest };