const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeEyeLog } = require("../utils/sanitize");

/**
 * Retrieve eye analysis logs for a pet, sorted by creation date (descending).
 * @param {Object} routeContext - Context object containing petID and event.
 * @param {string} routeContext.petID - The pet's MongoDB ObjectId.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with eye analysis logs or error.
 */
async function getPetEyeAnalysisLogs(routeContext) {
  const { event } = routeContext;
  const petID = event.pathParameters?.petID;

  try {
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
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { getPetEyeAnalysisLogs };