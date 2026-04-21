const { corsHeaders } = require("../cors");

const ERROR_MESSAGES = {
  "others.internalError": "Internal Server Error",
  "others.invalidJSON": "Invalid JSON format",
  "others.invalidPathParam": "Invalid path parameter",
  "others.methodNotAllowed": "Method not allowed",
  "others.originNotAllowed": "Origin not allowed",
  "others.unauthorized": "Unauthorized",
  "petInfoByPetNumber.errors.notFound": "Pet not found",
  "petInfoByPetNumber.errors.tagIdRequired": "Tag ID is required",
};

function resolveErrorMessage(errorKey) {
  return ERROR_MESSAGES[errorKey] || errorKey;
}

const createErrorResponse = (statusCode, error, event) => {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(event),
    },
    body: JSON.stringify({
      success: false,
      errorKey: error,
      error: resolveErrorMessage(error),
      ...(event.awsRequestId ? { requestId: event.awsRequestId } : {}),
    }),
  };
};

const createSuccessResponse = (statusCode, event, data = {}, extraHeaders = {}) => {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(event),
      ...extraHeaders,
    },
    body: JSON.stringify({
      success: true,
      ...data,
    }),
  };
};

module.exports = {
  createErrorResponse,
  createSuccessResponse,
};