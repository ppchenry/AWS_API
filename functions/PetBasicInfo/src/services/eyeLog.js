const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeEyeLog } = require("../utils/sanitize");
const { loadAuthorizedPet } = require("../middleware/selfAccess");

/**
 * Retrieve eye analysis logs for a pet, sorted by creation date (descending).
 * @param {Object} routeContext - Context object containing event.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with eye analysis logs or error.
 */
async function getPetEyeAnalysisLogs(routeContext) {
  const { event } = routeContext;
  const petID = event.pathParameters?.petID;

  try {
    const petResult = await loadAuthorizedPet({ event });
    if (!petResult.isValid) {
      return petResult.error;
    }

    const EyeAnalysis = mongoose.model("EyeAnalysisRecord");

    const eyeAnalysisLogList = await EyeAnalysis.find({ petId: petID })
      .select("_id petId image eyeSide createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return createSuccessResponse(200, event, {
      message: "petBasicInfo.success.eyeLogRetrievedSuccessfully",
      result: eyeAnalysisLogList.map(sanitizeEyeLog),
    });
  } catch (error) {
    logError("Failed to retrieve pet eye logs", {
      scope: "services.eyeLog.getPetEyeAnalysisLogs",
      event,
      error,
      extra: {
        petID,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { getPetEyeAnalysisLogs };