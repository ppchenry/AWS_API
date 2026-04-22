require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { validatePetLookupRequest } = require("./middleware/guard");
const { createErrorResponse, createSuccessResponse } = require("./utils/response");
const { logError } = require("./utils/logger");
const { sanitizePet } = require("./utils/sanitize");

const ROUTE_KEY = "GET /pets/getPetInfobyTagId/{tagId}";
const PUBLIC_PET_PROJECTION = {
  name: 1,
  breedimage: 1,
  animal: 1,
  birthday: 1,
  weight: 1,
  sex: 1,
  sterilization: 1,
  breed: 1,
  features: 1,
  info: 1,
  status: 1,
  receivedDate: 1,
};

async function handleRequest(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  event.awsRequestId = context.awsRequestId;

  try {
    const optionsResponse = handleOptions(event);
    if (optionsResponse) {
      return optionsResponse;
    }

    const validation = validatePetLookupRequest({ event });
    if (!validation.isValid) {
      return validation.error;
    }

    const routeKey = `${event.httpMethod} ${event.resource}`;
    if (routeKey !== ROUTE_KEY) {
      return createErrorResponse(405, "common.methodNotAllowed", event);
    }

    const readConn = await getReadConnection();
    const Pet = readConn.model("Pet");
    const pet = await Pet.findOne({
      tagId: validation.tagId,
      deleted: { $ne: true },
    }, PUBLIC_PET_PROJECTION).lean();

    return createSuccessResponse(200, event, {
      message: "Pet tag lookup processed successfully",
      form: sanitizePet(pet),
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

    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { handleRequest };
