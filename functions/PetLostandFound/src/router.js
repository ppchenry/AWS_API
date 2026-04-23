const { createErrorResponse } = require("./utils/response");

/**
 * Creates a lazy-loaded route handler.
 *
 * @param {string} modulePath
 * @param {string} exportName
 * @returns {function(Object): Promise<any>}
 */
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

/**
 * Route map: "${HTTP_METHOD} ${event.resource}" → handler | null (405).
 *
 * Dead routes (UploadArrayImages, GetS3Image, tag uploader) have been removed.
 * They were unreachable via API Gateway and classified as dead code.
 */
const routes = {
  // Pet Lost
  "GET /v2/pets/pet-lost": lazyRoute("./services/petLost", "listPetLost"),
  "POST /v2/pets/pet-lost": lazyRoute("./services/petLost", "createPetLost"),
  "DELETE /v2/pets/pet-lost/{petLostID}": lazyRoute("./services/petLost", "deletePetLost"),

  // Pet Found
  "GET /v2/pets/pet-found": lazyRoute("./services/petFound", "listPetFound"),
  "POST /v2/pets/pet-found": lazyRoute("./services/petFound", "createPetFound"),
  "DELETE /v2/pets/pet-found/{petFoundID}": lazyRoute("./services/petFound", "deletePetFound"),

  // Notifications
  "GET /v2/account/{userId}/notifications": lazyRoute("./services/notifications", "listNotifications"),
  "POST /v2/account/{userId}/notifications": lazyRoute("./services/notifications", "createNotification"),
  "PUT /v2/account/{userId}/notifications/{notificationId}": lazyRoute("./services/notifications", "archiveNotification"),

  // ==========================================
  // DEAD / GHOST ROUTES (Safe to ignore or remove)
  // These routes were either moved to other Lambdas or deleted from API Gateway,
  // but logic or permissions for them still existed in the monolithic index.js.
  // ==========================================
  // Unknown else legacy route N/A (Catch-all Tag Uploader)<br>(Formerly /ptag/...)?
  "Unknown Else Probably /ptag?": null,
  // Moved to EyeUpload Lambda (Currently misconfigured in API Gateway)
  "GET /pets/gets3Image": null,
  "POST /pets/upload-array-images": null,
  // Moved to OrderVerification
  "PUT /orderVerification/supplier/{proxy+}": null,
};

/**
 * Matches the incoming event to a service function.
 *
 * @param {Object} routeContext - { event, body }
 * @returns {Promise<Object>} Lambda response.
 */
async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(405, "common.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };
