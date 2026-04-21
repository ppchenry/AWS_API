function getRequestLogContext(event) {
  if (!event) return undefined;

  return {
    requestId: event.awsRequestId || event.requestContext?.requestId,
    method: event.httpMethod,
    resource: event.resource,
    userId: event.userId,
    userRole: event.userRole,
  };
}

function serializeError(error) {
  if (!error) return undefined;

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack,
  };
}

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

  const logger = level === "error"
    ? console.error
    : level === "warn"
      ? console.warn
      : console.log;

  logger(JSON.stringify(entry));
}

function logInfo(message, options) {
  writeStructuredLog("info", message, options);
}

function logWarn(message, options) {
  writeStructuredLog("warn", message, options);
}

function logError(message, options) {
  writeStructuredLog("error", message, options);
}

module.exports = {
  logInfo,
  logWarn,
  logError,
};
