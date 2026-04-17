const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "GET /pets/{petID}/detail-info": lazyRoute("./services/detailInfo", "getDetailInfo"),
  "POST /pets/{petID}/detail-info": lazyRoute("./services/detailInfo", "updateDetailInfo"),
  "POST /pets/{petID}/detail-info/transfer": lazyRoute("./services/transfer", "createTransfer"),
  "PUT /pets/{petID}/detail-info/transfer/{transferId}": lazyRoute("./services/transfer", "updateTransfer"),
  "DELETE /pets/{petID}/detail-info/transfer/{transferId}": lazyRoute("./services/transfer", "deleteTransfer"),
  "PUT /pets/{petID}/detail-info/NGOtransfer": lazyRoute("./services/ngoTransfer", "ngoTransfer"),
  "GET /v2/pets/{petID}/detail-info/source": lazyRoute("./services/source", "getSource"),
  "POST /v2/pets/{petID}/detail-info/source": lazyRoute("./services/source", "createSource"),
  "PUT /v2/pets/{petID}/detail-info/source/{sourceId}": lazyRoute("./services/source", "updateSource"),
  "GET /v2/pets/{petID}/pet-adoption": lazyRoute("./services/adoption", "getAdoption"),
  "POST /v2/pets/{petID}/pet-adoption": lazyRoute("./services/adoption", "createAdoption"),
  "PUT /v2/pets/{petID}/pet-adoption/{adoptionId}": lazyRoute("./services/adoption", "updateAdoption"),
  "DELETE /v2/pets/{petID}/pet-adoption/{adoptionId}": lazyRoute("./services/adoption", "deleteAdoption"),
};

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
