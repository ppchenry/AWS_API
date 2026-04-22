require("./config/env");

const { getReadConnection } = require("./config/db");
const { handleOptions } = require("./cors");
const { authJWT } = require("./middleware/authJWT");
const { validateRequest } = require("./middleware/guard");
const { createErrorResponse, createSuccessResponse } = require("./utils/response");
const { logError } = require("./utils/logger");
const { getTranslation, loadTranslations } = require("./utils/i18n");
const { sanitizePet } = require("./utils/sanitize");
const { enforceRateLimit } = require("./utils/rateLimit");
const { parseDDMMYYYY } = require("./utils/validators");
const { getFirstZodIssueMessage } = require("./utils/zod");
const { createPetSchema } = require("./zodSchema/createPetSchema");

const PUBLIC_RESOURCES = [];
const ROUTE_KEY = "POST /pets/create-pet-basic-info";

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

    const guardResult = await validateRequest({ event });
    if (!guardResult.isValid) {
      return guardResult.error;
    }

    const routeKey = `${event.httpMethod} ${event.resource}`;
    if (routeKey !== ROUTE_KEY) {
      return createErrorResponse(405, "others.methodNotAllowed", event);
    }

    await getReadConnection();

    const rateLimit = await enforceRateLimit({
      event,
      action: "createPetBasicInfo",
      identifier: event.userId,
      limit: 20,
      windowSec: 300,
    });

    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = createPetSchema.safeParse(guardResult.body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error, "others.invalidInput"),
        event
      );
    }

    const validated = parseResult.data;
    const readConn = await getReadConnection();
    const User = readConn.model("User");
    const Pet = readConn.model("Pet");

    const user = await User.findOne({
      _id: event.userId,
      deleted: { $ne: true },
    })
      .select("_id role deleted")
      .lean();

    if (!user) {
      return createErrorResponse(404, "userNotFound", event);
    }

    if (validated.tagId) {
      const existingTag = await Pet.findOne({
        tagId: validated.tagId,
        deleted: { $ne: true },
      })
        .select("_id")
        .lean();

      if (existingTag) {
        return createErrorResponse(409, "duplicatePetTagId", event);
      }
    }

    const pet = await Pet.create({
      userId: user._id,
      name: validated.name,
      birthday: parseDDMMYYYY(validated.birthday),
      weight: validated.weight,
      sex: validated.sex,
      sterilization: validated.sterilization,
      animal: validated.animal,
      breed: validated.breed,
      features: validated.features,
      info: validated.info,
      status: validated.status,
      breedimage: validated.breedimage || [],
      tagId: validated.tagId,
      receivedDate: validated.receivedDate ? parseDDMMYYYY(validated.receivedDate) : null,
      transferNGO: [{
        regDate: null,
        regPlace: null,
        transferOwner: null,
        UserContact: null,
        UserEmail: null,
        transferContact: null,
        transferRemark: null,
        isTransferred: false,
      }],
    });

    const translations = loadTranslations(event.locale || "zh");

    return createSuccessResponse(201, event, {
      message: getTranslation(translations, "success"),
      id: pet._id,
      result: sanitizePet(pet),
    });
  } catch (error) {
    logError("Unhandled CreatePetBasicInfo request error", {
      scope: "handler.handleRequest",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { handleRequest };
