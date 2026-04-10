/**
 * @fileoverview Route dispatch factory shared across Lambda functions.
 * Provides a lazy-loading route helper and a request dispatcher that each
 * Lambda wires up with its own route map.
 *
 * Usage in each Lambda's router.js:
 *
 *   const { createRouter, lazyRoute } = require('../../../../shared/router');
 *   const { createErrorResponse } = require('./utils/response');
 *
 *   const routes = {
 *     'GET /some/path': lazyRoute('./services/myService', 'myHandler'),
 *     'POST /some/path': lazyRoute('./services/myService', 'myOtherHandler'),
 *   };
 *
 *   const { routeRequest } = createRouter(routes, createErrorResponse);
 *   module.exports = { routeRequest };
 */

/**
 * @typedef {Object} RouteContext
 * @property {import('aws-lambda').APIGatewayProxyEvent} event
 */

/**
 * Creates a route handler that loads a service module on demand.
 * This trims cold-start work without changing endpoint behavior.
 *
 * @param {string} modulePath Require-resolvable path to the service module (relative to the calling Lambda).
 * @param {string} exportName The exported function name to call on the resolved module.
 * @returns {function(RouteContext): Promise<any>}
 */
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

/**
 * Creates a `routeRequest` dispatcher bound to the provided route map and
 * error response builder.
 *
 * @param {Record<string, ((ctx: RouteContext) => Promise<any>) | null>} routes
 *   Map of `"METHOD /resource"` keys to handler functions, or null for
 *   intentionally unimplemented routes.
 * @param {function(number, string, import("aws-lambda").APIGatewayProxyEvent): any} createErrorResponse
 *   The Lambda's own error response builder.
 * @returns {{ routeRequest: (routeContext: RouteContext) => Promise<import('aws-lambda').APIGatewayProxyResult> }}
 */
function createRouter(routes, createErrorResponse) {
  /**
   * Matches the incoming AWS event to a specific service function.
   *
   * @async
   * @param {RouteContext} routeContext
   * @returns {Promise<import('aws-lambda').APIGatewayProxyResult>}
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

  return { routeRequest };
}

module.exports = { createRouter, lazyRoute };
