/**
 * Extracts a structured request context from a Lambda event for log entries.
 *
 * @param {import('aws-lambda').APIGatewayProxyEvent | null | undefined} event
 * @returns {Record<string, any> | undefined}
 */
function getRequestLogContext(event) {
  if (!event) {
    return undefined;
  }

  return {
    requestId: event.awsRequestId || event.requestContext?.requestId,
    stage: event.requestContext?.stage,
    method: event.httpMethod,
    resource: event.resource,
    path: event.path,
    userId: event.userId,
    userEmail: event.userEmail,
    userRole: event.userRole,
    ngoId: event.requestContext?.authorizer?.ngoId,
  };
}

/**
 * Serializes an Error (or error-like object) to a plain object safe for JSON logging.
 *
 * @param {Error | null | undefined} error
 * @returns {Record<string, any> | undefined}
 */
function serializeError(error) {
  if (!error) {
    return undefined;
  }

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack,
  };
}

/**
 * Writes a structured JSON log entry to stdout/stderr.
 *
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 * @param {Object} [options]
 * @param {string} [options.scope] - Dotted module path, e.g. `"services.basicInfo.getPetBasicInfo"`.
 * @param {import('aws-lambda').APIGatewayProxyEvent} [options.event]
 * @param {Error} [options.error]
 * @param {Record<string, any>} [options.extra]
 */
function writeStructuredLog(level, message, options = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    scope: options.scope,
  };

  const request = getRequestLogContext(options.event);
  if (request) {
    entry.request = request;
  }

  const error = serializeError(options.error);
  if (error) {
    entry.error = error;
  }

  if (options.extra && Object.keys(options.extra).length > 0) {
    entry.extra = options.extra;
  }

  const logger = level === "error"
    ? console.error
    : level === "warn"
      ? console.warn
      : console.log;

  logger(JSON.stringify(entry));
}

/**
 * Logs an informational message.
 *
 * @param {string} message
 * @param {Parameters<typeof writeStructuredLog>[2]} [options]
 */
function logInfo(message, options) {
  writeStructuredLog("info", message, options);
}

/**
 * Logs a warning message.
 *
 * @param {string} message
 * @param {Parameters<typeof writeStructuredLog>[2]} [options]
 */
function logWarn(message, options) {
  writeStructuredLog("warn", message, options);
}

/**
 * Logs an error message.
 *
 * @param {string} message
 * @param {Parameters<typeof writeStructuredLog>[2]} [options]
 */
function logError(message, options) {
  writeStructuredLog("error", message, options);
}

module.exports = {
  logInfo,
  logWarn,
  logError,
};