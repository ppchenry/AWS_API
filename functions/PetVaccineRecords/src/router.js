const { createErrorResponse } = require("./utils/response");

function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "GET /pets/{petID}/vaccine-record": lazyRoute("./services/vaccine", "getVaccineRecords"),
  "POST /pets/{petID}/vaccine-record": lazyRoute("./services/vaccine", "createVaccineRecord"),
  "PUT /pets/{petID}/vaccine-record/{vaccineID}": lazyRoute("./services/vaccine", "updateVaccineRecord"),
  "DELETE /pets/{petID}/vaccine-record/{vaccineID}": lazyRoute("./services/vaccine", "deleteVaccineRecord"),
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
