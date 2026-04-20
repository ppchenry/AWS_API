/**
 * Builds the structured request context attached to log entries.
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent | Record<string, any> | undefined} event
 * @returns {Record<string, any> | undefined}
 */
function getRequestLogContext(event) {
  if (!event) {
    return undefined;
  }

  return {
    requestId: event.requestContext?.requestId || event.awsRequestId,
    stage: event.requestContext?.stage,
    method: event.httpMethod,
    resource: event.resource,
    path: event.path,
    userId: event.userId,
    userEmail: event.userEmail,
    userRole: event.userRole,
  };
}

/**
 * Serializes an Error-like object into the structured log error shape.
 *
 * @param {any} error
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
 * Writes one structured JSON log entry using the appropriate console method.
 *
 * @param {"info" | "warn" | "error"} level
 * @param {string} message
 * @param {{ scope?: string, event?: any, error?: any, extra?: Record<string, any> }} [options]
 * @returns {void}
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

  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  logger(JSON.stringify(entry));
}

/**
 * Emits an info-level structured log entry.
 *
 * @param {string} message
 * @param {{ scope?: string, event?: any, error?: any, extra?: Record<string, any> }} [options]
 * @returns {void}
 */
function logInfo(message, options) {
  writeStructuredLog("info", message, options);
}

/**
 * Emits a warn-level structured log entry.
 *
 * @param {string} message
 * @param {{ scope?: string, event?: any, error?: any, extra?: Record<string, any> }} [options]
 * @returns {void}
 */
function logWarn(message, options) {
  writeStructuredLog("warn", message, options);
}

/**
 * Emits an error-level structured log entry.
 *
 * @param {string} message
 * @param {{ scope?: string, event?: any, error?: any, extra?: Record<string, any> }} [options]
 * @returns {void}
 */
function logError(message, options) {
  writeStructuredLog("error", message, options);
}

module.exports = {
  logInfo,
  logWarn,
  logError,
};
