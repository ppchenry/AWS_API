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
  "GET /pets/pet-lost": lazyRoute("./services/petLost", "listPetLost"),
  "POST /pets/pet-lost": lazyRoute("./services/petLost", "createPetLost"),
  "DELETE /pets/pet-lost/{petLostID}": lazyRoute("./services/petLost", "deletePetLost"),

  // Pet Found
  "GET /pets/pet-found": lazyRoute("./services/petFound", "listPetFound"),
  "POST /pets/pet-found": lazyRoute("./services/petFound", "createPetFound"),
  "DELETE /pets/pet-found/{petFoundID}": lazyRoute("./services/petFound", "deletePetFound"),

  // Notifications
  "GET /v2/account/{userId}/notifications": lazyRoute("./services/notifications", "listNotifications"),
  "POST /v2/account/{userId}/notifications": lazyRoute("./services/notifications", "createNotification"),
  "PUT /v2/account/{userId}/notifications/{notificationId}": lazyRoute("./services/notifications", "archiveNotification"),
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
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };
