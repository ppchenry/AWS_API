/**
 * Extracts safe request metadata for structured logs.
 *
 * @param {Record<string, any>} [event]
 * @returns {Record<string, any>|undefined}
 */
function getRequestLogContext(event) {
  if (!event) return undefined;

  return {
    requestId: event.requestContext?.requestId,
    method: event.httpMethod,
    resource: event.resource,
    userId: event.userId,
    userEmail: event.userEmail,
    userRole: event.userRole,
  };
}

/**
 * Normalizes Error objects into JSON-safe log payloads.
 *
 * @param {Error & Record<string, any>} [error]
 * @returns {Record<string, any>|undefined}
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
 * Writes a structured log entry to the matching console method.
 *
 * @param {"info"|"warn"|"error"} level
 * @param {string} message
 * @param {{ scope?: string, event?: Record<string, any>, error?: Error & Record<string, any>, extra?: Record<string, any> }} [options]
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
  if (request) entry.request = request;

  const error = serializeError(options.error);
  if (error) entry.error = error;

  if (options.extra && Object.keys(options.extra).length > 0) {
    entry.extra = options.extra;
  }

  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  logger(JSON.stringify(entry));
}

/**
 * @param {string} message
 * @param {{ scope?: string, event?: Record<string, any>, error?: Error & Record<string, any>, extra?: Record<string, any> }} [options]
 */
function logInfo(message, options) {
  writeStructuredLog("info", message, options);
}

/**
 * @param {string} message
 * @param {{ scope?: string, event?: Record<string, any>, error?: Error & Record<string, any>, extra?: Record<string, any> }} [options]
 */
function logWarn(message, options) {
  writeStructuredLog("warn", message, options);
}

/**
 * @param {string} message
 * @param {{ scope?: string, event?: Record<string, any>, error?: Error & Record<string, any>, extra?: Record<string, any> }} [options]
 */
function logError(message, options) {
  writeStructuredLog("error", message, options);
}

module.exports = {
  logInfo,
  logWarn,
  logError,
};
