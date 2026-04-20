const { createErrorResponse } = require("./utils/response");

/**
 * Creates a route handler that loads a service module on demand.
 *
 * @param {string} modulePath
 * @param {string} exportName
 * @returns {function(RouteContext): Promise<any>}
 */
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

/**
 * @type {Record<string, ((ctx: RouteContext) => Promise<any>) | null>}
 */
const routes = {
  // Medical records
  "GET /pets/{petID}/medical-record": lazyRoute("./services/medical", "getMedicalRecords"),
  "POST /pets/{petID}/medical-record": lazyRoute("./services/medical", "createMedicalRecord"),
  "PUT /pets/{petID}/medical-record/{medicalID}": lazyRoute("./services/medical", "updateMedicalRecord"),
  "DELETE /pets/{petID}/medical-record/{medicalID}": lazyRoute("./services/medical", "deleteMedicalRecord"),

  // Medication records
  "GET /pets/{petID}/medication-record": lazyRoute("./services/medication", "getMedicationRecords"),
  "POST /pets/{petID}/medication-record": lazyRoute("./services/medication", "createMedicationRecord"),
  "PUT /pets/{petID}/medication-record/{medicationID}": lazyRoute("./services/medication", "updateMedicationRecord"),
  "DELETE /pets/{petID}/medication-record/{medicationID}": lazyRoute("./services/medication", "deleteMedicationRecord"),

  // Deworm records
  "GET /pets/{petID}/deworm-record": lazyRoute("./services/deworm", "getDewormRecords"),
  "POST /pets/{petID}/deworm-record": lazyRoute("./services/deworm", "createDewormRecord"),
  "PUT /pets/{petID}/deworm-record/{dewormID}": lazyRoute("./services/deworm", "updateDewormRecord"),
  "DELETE /pets/{petID}/deworm-record/{dewormID}": lazyRoute("./services/deworm", "deleteDewormRecord"),

  // Blood test records
  "GET /pets/{petID}/blood-test-record": lazyRoute("./services/bloodTest", "getBloodTestRecords"),
  "POST /pets/{petID}/blood-test-record": lazyRoute("./services/bloodTest", "createBloodTestRecord"),
  "PUT /pets/{petID}/blood-test-record/{bloodTestID}": lazyRoute("./services/bloodTest", "updateBloodTestRecord"),
  "DELETE /pets/{petID}/blood-test-record/{bloodTestID}": lazyRoute("./services/bloodTest", "deleteBloodTestRecord"),
};

/**
 * Matches the incoming AWS event to a specific service function.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent, body: Record<string, any> | null }} routeContext
 * @returns {Promise<import("aws-lambda").APIGatewayProxyResult>}
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
