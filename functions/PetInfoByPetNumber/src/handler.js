require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validatePetLookupRequest } = require("./middleware/guard");
const { createErrorResponse, createSuccessResponse } = require("./utils/response");
const { logError } = require("./utils/logger");
const { sanitizePet } = require("./utils/sanitize");

const PUBLIC_RESOURCES = ["/pets/getPetInfobyTagId/{tagId}"];
const ROUTE_KEY = "GET /pets/getPetInfobyTagId/{tagId}";

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
      return optionsResponse;
    }

    const authError = authJWT({ event });
    if (authError && !PUBLIC_RESOURCES.includes(event.resource)) {
      return authError;
    }

    const validation = validatePetLookupRequest({ event });
    if (!validation.isValid) {
      return validation.error;
    }

    const routeKey = `${event.httpMethod} ${event.resource}`;
    if (routeKey !== ROUTE_KEY) {
      return createErrorResponse(405, "others.methodNotAllowed", event);
    }

    const readConn = await getReadConnection();
    const Pet = readConn.model("Pet");
    const pet = await Pet.findOne({
      tagId: validation.tagId,
      deleted: { $ne: true },
    }).lean();

    if (!pet) {
      return createErrorResponse(404, "petInfoByPetNumber.errors.notFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "Pet basic info retrieved successfully",
      form: sanitizePet(pet),
      id: pet._id,
    });
  } catch (error) {
    logError("Unhandled request error", {
      scope: "handler.handleRequest",
      event,
      error,
      extra: {
        awsRequestId: context.awsRequestId,
      },
    });

    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };