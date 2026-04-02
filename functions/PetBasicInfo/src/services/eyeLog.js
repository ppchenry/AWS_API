const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");

/**
 * Retrieve eye analysis logs for a pet, sorted by creation date (descending).
 * @param {Object} routeContext - Context object containing petID, translations, event.
 * @param {string} routeContext.petID - The pet's MongoDB ObjectId.
 * @param {Object} routeContext.translations - Translations for i18n.
 * @param {Object} routeContext.event - The Lambda event object.
 * @returns {Promise<Object>} Lambda response with eye analysis logs or error.
 */
async function getPetEyeAnalysisLogs(routeContext) {
  const { petID, translations, event } = routeContext;

  try {
    const EyeAnalysis = mongoose.model("EyeAnalysisRecord");

    const eyeAnalysisLogList = await EyeAnalysis.find({ petId: petID })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return createSuccessResponse(
      "petBasicInfo.success.eyeLogRetrievedSuccessfully",
      { result: eyeAnalysisLogList },
      translations,
      event
    );
  } catch (error) {
    return createErrorResponse(
      500,
      "petBasicInfo.errors.errorRetrievingEyeLog",
      translations,
      event
    );
  }
}

module.exports = { getPetEyeAnalysisLogs };