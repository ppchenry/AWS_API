const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { escapeRegex } = require("../utils/validators");
const { sanitizeAdoption } = require("../utils/sanitize");
const { logError } = require("../utils/logger");

const PAGE_SIZE = 16;
const EXCLUDED_SITES = ["Arc Dog Shelter", "Tolobunny", "HKRABBIT"];
const LIST_PROJECTION = {
  _id: 1,
  Name: 1,
  Age: 1,
  Sex: 1,
  Breed: 1,
  Image_URL: 1,
};
const DETAIL_PROJECTION = {
  _id: 1,
  Name: 1,
  Age: 1,
  Sex: 1,
  Breed: 1,
  Image_URL: 1,
  Remark: 1,
  AdoptionSite: 1,
  URL: 1,
};

const AGE_RANGES = {
  幼年: { Age: { $lt: 12 } },
  青年: { Age: { $gte: 12, $lte: 36 } },
  成年: { Age: { $gte: 48, $lte: 72 } },
  老年: { Age: { $gt: 84 } },
};

function buildAdoptionListQuery(query = {}) {
  const conditions = {
    $and: [
      { AdoptionSite: { $nin: EXCLUDED_SITES } },
      { Image_URL: { $ne: [] } },
    ],
  };

  if (query.animalTypes?.length) {
    conditions.Animal_Type = { $in: query.animalTypes };
  }

  if (query.locations?.length) {
    conditions.$and.push({ AdoptionSite: { $in: query.locations } });
  }

  if (query.sexes?.length) {
    conditions.Sex = { $in: query.sexes };
  }

  const ageFilters = (query.ages || [])
    .map((age) => AGE_RANGES[age])
    .filter(Boolean);

  if (ageFilters.length > 0) {
    conditions.$and.push({ $or: ageFilters });
  }

  if (query.search) {
    const safeSearch = escapeRegex(query.search);
    conditions.$or = [
      { Breed: { $regex: safeSearch, $options: "i" } },
      { Animal_Type: { $regex: safeSearch, $options: "i" } },
      { Remark: { $regex: safeSearch, $options: "i" } },
    ];
  }

  return conditions;
}

async function getAdoptionList({ event, query }) {
  const scope = "services.adoption.getAdoptionList";

  try {
    const Adoption = mongoose.model("Adoption");
    const mongoQuery = buildAdoptionListQuery(query);
    const totalResult = await Adoption.countDocuments(mongoQuery);
    const maxPage = Math.ceil(totalResult / PAGE_SIZE);
    const page = query.page || 1;

    const adoptionList = await Adoption.aggregate([
      { $match: mongoQuery },
      {
        $addFields: {
          parsedDate: {
            $convert: {
              input: "$Creation_Date",
              to: "date",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $sort: { parsedDate: -1, _id: -1 } },
      { $skip: (page - 1) * PAGE_SIZE },
      { $limit: PAGE_SIZE },
      { $project: LIST_PROJECTION },
    ]);

    return createSuccessResponse(200, event, {
      adoptionList: adoptionList.map(sanitizeAdoption),
      maxPage,
      totalResult,
    });
  } catch (error) {
    logError("Failed to fetch adoption list", {
      scope,
      event,
      error,
      extra: { query },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

async function getAdoptionById({ event, query }) {
  const scope = "services.adoption.getAdoptionById";

  try {
    const Adoption = mongoose.model("Adoption");
    const pet = await Adoption.findOne({ _id: query.id }).select(DETAIL_PROJECTION).lean();

    if (!pet) {
      return createErrorResponse(404, "getAdoption.errors.petNotFound", event);
    }

    return createSuccessResponse(200, event, {
      pet: sanitizeAdoption(pet),
    });
  } catch (error) {
    logError("Failed to fetch adoption pet", {
      scope,
      event,
      error,
      extra: { adoptionId: query.id },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = {
  PAGE_SIZE,
  LIST_PROJECTION,
  DETAIL_PROJECTION,
  buildAdoptionListQuery,
  getAdoptionList,
  getAdoptionById,
};