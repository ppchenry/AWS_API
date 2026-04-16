const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  // Active routes
  "POST /util/uploadImage": lazyRoute("./services/upload", "uploadImage"),
  "POST /util/uploadPetBreedImage": lazyRoute("./services/upload","uploadPetBreedImage"),
  "POST /pets/updatePetImage": lazyRoute("./services/petImage","updatePetImage"),
  "POST /pets/create-pet-basic-info-with-image": lazyRoute("./services/petImage","createPetBasicInfoWithImage"),
  "POST /analysis/eye-upload/{petId}": lazyRoute("./services/eyeAnalysis","eyeUploadAnalysis"),
  "POST /analysis/breed": lazyRoute("./services/breedAnalysis","breedAnalysis"),

  // Dead routes — 405
  "PUT /pets/updatePetEye": null,
  "GET /pets/gets3Image": null,
  "POST /pets/create-pet-basic-info": null,
};

async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (routeAction === null) {
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  if (!routeAction) {
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }

  return await routeAction(routeContext);
}

module.exports = { routeRequest };
