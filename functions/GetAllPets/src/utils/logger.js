/**
 * Extracts request metadata from an API Gateway event for structured logging.
 * @param {object} event - API Gateway event
 * @returns {object|undefined} Log context with requestId, method, resource, etc.
 */
function getRequestLogContext(event) {
  if (!event) return undefined;

  return {
    requestId: event.awsRequestId,
    stage: event.requestContext?.stage,
    method: event.httpMethod,
    resource: event.resource,
    path: event.path,
    userId: event.userId,
    userRole: event.userRole,
    ngoId: event.ngoId,
  };
}

/**
 * Serializes an Error object into a plain object for JSON logging.
 * @param {Error} error - Error instance
 * @returns {object|undefined} Serialized error with name, message, code, stack
 */
function serializeError(error) {
  if (!error) return undefined;

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack,
  };
}

/**
 * Writes a structured JSON log entry to the console.
 * @param {'info'|'warn'|'error'} level - Log level
 * @param {string} message - Log message
 * @param {object} [options] - Additional context (scope, event, error, extra)
 */
function writeStructuredLog(level, message, options = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    scope: options.scope,
  };

  const request = getRequestLogContext(options.event);
  if (request) entry.request = request;

  const error = serializeError(options.error);
  if (error) entry.error = error;

  if (options.extra && Object.keys(options.extra).length > 0) {
    entry.extra = options.extra;
  }

  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  logger(JSON.stringify(entry));
}

/**
 * Logs an info-level structured message.
 * @param {string} message - Log message
 * @param {object} [options] - Additional context
 */
function logInfo(message, options) {
  writeStructuredLog("info", message, options);
}

/**
 * Logs a warn-level structured message.
 * @param {string} message - Log message
 * @param {object} [options] - Additional context
 */
function logWarn(message, options) {
  writeStructuredLog("warn", message, options);
}

/**
 * Logs an error-level structured message.
 * @param {string} message - Log message
 * @param {object} [options] - Additional context
 */
function logError(message, options) {
  writeStructuredLog("error", message, options);
}

module.exports = { logInfo, logWarn, logError };
