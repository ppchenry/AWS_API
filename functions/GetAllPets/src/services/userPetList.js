const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getTranslation, loadTranslations } = require("../utils/i18n");
const { sanitizePets } = require("../utils/sanitize");

const PAGE_LIMIT = 10;

/**
 * Returns a paginated list of non-deleted pets owned by the authenticated user.
 * Self-access is enforced by guard.js + selfAccess.js upstream.
 * @param {object} param0 - Route context
 * @param {object} param0.event - API Gateway event (userId in pathParameters)
 * @returns {Promise<object>} API Gateway response with form array and total count
 */
async function getUserPetList({ event }) {
  try {
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return createErrorResponse(400, "getAllPets.errors.getPetsByUser.missingUserId", event);
    }

    // Self-access is enforced by guard.js + selfAccess.js (pathUserId policy).
    // userId ObjectId format is already validated by guard.js.

    const queryParams = event.queryStringParameters || {};
    const pageNumber = Math.max(1, parseInt(queryParams.page || "1", 10));

    const Pet = mongoose.model("Pet");

    const query = { userId, deleted: false };

    const [pets, totalNumber] = await Promise.all([
      Pet.find(query)
        .select("-__v")
        .sort({ updatedAt: -1 })
        .skip((pageNumber - 1) * PAGE_LIMIT)
        .limit(PAGE_LIMIT)
        .lean(),
      Pet.countDocuments(query),
    ]);

    return createSuccessResponse(200, event, {
      message: getTranslation(
        loadTranslations(event.cookies?.language || "zh"),
        "getAllPets.success.getPetsByUser.retrieved"
      ),
      form: sanitizePets(pets),
      total: totalNumber,
    });
  } catch (error) {
    logError("Failed to fetch user pet list", {
      scope: "services.userPetList.getUserPetList",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { getUserPetList };
