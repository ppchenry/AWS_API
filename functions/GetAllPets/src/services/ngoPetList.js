const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getTranslation, loadTranslations } = require("../utils/i18n");
const { escapeRegex } = require("../utils/validators");
const { sanitizePets } = require("../utils/sanitize");

const SORT_ALLOWLIST = new Set([
  "updatedAt",
  "createdAt",
  "name",
  "animal",
  "breed",
  "birthday",
  "receivedDate",
  "ngoPetId",
]);

const PAGE_LIMIT = 30;

/**
 * Returns a paginated, searchable, sortable list of non-deleted pets for an NGO.
 * Public route — no JWT required.
 * @param {object} param0 - Route context
 * @param {object} param0.event - API Gateway event (ngoId in pathParameters)
 * @returns {Promise<object>} API Gateway response with pets array and pagination metadata
 */
async function getNgoPetList({ event }) {
  try {
    const ngoId = event.pathParameters?.ngoId;
    const queryParams = event.queryStringParameters || {};

    if (!ngoId) {
      return createErrorResponse(400, "getAllPets.errors.ngoPath.missingNgoId", event);
    }

    const pageNumber = Math.max(1, parseInt(queryParams.page || "1", 10));
    const search =
      typeof queryParams.search === "string"
        ? queryParams.search.trim()
        : "";
    const sortBy = SORT_ALLOWLIST.has(queryParams.sortBy)
      ? queryParams.sortBy
      : "updatedAt";
    const sortOrder =
      String(queryParams.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;

    const query = { ngoId, deleted: false };

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { animal: { $regex: safeSearch, $options: "i" } },
        { breed: { $regex: safeSearch, $options: "i" } },
        { ngoPetId: { $regex: safeSearch, $options: "i" } },
        { locationName: { $regex: safeSearch, $options: "i" } },
        { owner: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const Pet = mongoose.model("Pet");

    const [pets, totalNumber] = await Promise.all([
      Pet.find(query)
        .select("-__v")
        .sort({ [sortBy]: sortOrder, _id: -1 })
        .skip((pageNumber - 1) * PAGE_LIMIT)
        .limit(PAGE_LIMIT)
        .lean(),
      Pet.countDocuments(query),
    ]);

    if (!pets || pets.length === 0) {
      return createErrorResponse(404, "getAllPets.errors.ngoPath.noPetsFound", event);
    }

    return createSuccessResponse(200, event, {
      message: getTranslation(
        loadTranslations(event.cookies?.language || "zh"),
        "getAllPets.success.ngoPath.retrieved"
      ),
      pets: sanitizePets(pets),
      total: totalNumber,
      currentPage: pageNumber,
      perPage: PAGE_LIMIT,
    });
  } catch (error) {
    logError("Failed to fetch NGO pet list", {
      scope: "services.ngoPetList.getNgoPetList",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { getNgoPetList };
