const { handleRequest } = require("./src/handler");

/**
 * Lambda entry point. Delegates to the shared request handler.
 * @param {object} event - API Gateway event
 * @param {object} context - Lambda context
 * @returns {Promise<object>} API Gateway response
 */
exports.handler = async (event, context) => {
  return handleRequest(event, context);
};
