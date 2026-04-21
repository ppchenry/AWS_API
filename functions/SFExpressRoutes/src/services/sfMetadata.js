const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { enforceRateLimit } = require("../utils/rateLimit");
const {
  getAreaSchema,
  getNetCodeSchema,
  getPickupLocationsSchema,
} = require("../zodSchema/sfExpressSchema");
const {
  fetchAddressToken,
  fetchAreaList,
  fetchNetCodeList,
  fetchPickupAddresses,
} = require("./sfAddressClient");
const { getConfigError, getRateLimitKey } = require("./sfShared");

async function getToken({ event }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-get-token",
      limit: 10,
      windowSec: 300,
      identifier: getRateLimitKey(event),
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const configError = getConfigError(event, "services.sfMetadata.getToken", ["SF_ADDRESS_API_KEY"]);
    if (configError) return configError;

    const bearerToken = await fetchAddressToken();
    return createSuccessResponse(200, event, {
      bearer_token: bearerToken,
    });
  } catch (error) {
    logError("Failed to get SF address token", {
      scope: "services.sfMetadata.getToken",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function getArea({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-get-area",
      limit: 30,
      windowSec: 300,
      identifier: getRateLimitKey(event),
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = getAreaSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const areaList = await fetchAreaList(parseResult.data.token);
    return createSuccessResponse(200, event, {
      area_list: areaList,
    });
  } catch (error) {
    logError("Failed to get SF area list", {
      scope: "services.sfMetadata.getArea",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function getNetCode({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-get-netcode",
      limit: 30,
      windowSec: 300,
      identifier: getRateLimitKey(event),
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = getNetCodeSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const netCode = await fetchNetCodeList(parseResult.data);
    return createSuccessResponse(200, event, {
      netCode,
    });
  } catch (error) {
    logError("Failed to get SF netCode", {
      scope: "services.sfMetadata.getNetCode",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function getPickupLocations({ event, body }) {
  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "sf-express-get-pickup-locations",
      limit: 30,
      windowSec: 300,
      identifier: getRateLimitKey(event),
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = getPickupLocationsSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const addresses = await fetchPickupAddresses(parseResult.data);
    return createSuccessResponse(200, event, {
      addresses,
    });
  } catch (error) {
    logError("Failed to get SF pickup locations", {
      scope: "services.sfMetadata.getPickupLocations",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getToken,
  getArea,
  getNetCode,
  getPickupLocations,
};