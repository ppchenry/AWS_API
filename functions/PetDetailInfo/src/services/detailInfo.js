const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizePetDetail } = require("../utils/sanitize");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { parseDateFlexible, isValidDateFormat } = require("../utils/validators");
const { detailInfoUpdateSchema } = require("../zodSchema/detailInfoSchema");

async function getDetailInfo({ event }) {
  const scope = "services.detailInfo.getDetailInfo";
  try {
    const petID = event.pathParameters.petID;
    const Pet = mongoose.model("Pet");

    // Ownership already verified by middleware; fetch detail fields only
    const pet = await Pet.findOne({ _id: petID, deleted: false })
      .select("chipId placeOfBirth transfer transferNGO motherName motherBreed motherDOB motherChip motherPlaceOfBirth motherParity fatherName fatherBreed fatherDOB fatherChip fatherPlaceOfBirth")
      .lean();

    if (!pet) {
      return createErrorResponse(404, "petNotFound", event);
    }

    return createSuccessResponse(200, event, {
      form: sanitizePetDetail(pet),
      petId: petID,
    });
  } catch (error) {
    logError("Failed to get pet detail info", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function updateDetailInfo({ event, body }) {
  const scope = "services.detailInfo.updateDetailInfo";
  try {
    const petID = event.pathParameters.petID;
    const Pet = mongoose.model("Pet");

    // Zod validation
    const parseResult = detailInfoUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Validate date formats
    if (data.motherDOB && !isValidDateFormat(data.motherDOB)) {
      return createErrorResponse(400, "petDetailInfo.invalidDateFormat", event);
    }
    if (data.fatherDOB && !isValidDateFormat(data.fatherDOB)) {
      return createErrorResponse(400, "petDetailInfo.invalidDateFormat", event);
    }

    // Build update fields
    const updateFields = {};
    if (data.chipId !== undefined) updateFields.chipId = data.chipId;
    if (data.placeOfBirth !== undefined) updateFields.placeOfBirth = data.placeOfBirth;
    if (data.motherName !== undefined) updateFields.motherName = data.motherName;
    if (data.motherBreed !== undefined) updateFields.motherBreed = data.motherBreed;
    if (data.motherDOB !== undefined) updateFields.motherDOB = parseDateFlexible(data.motherDOB);
    if (data.motherChip !== undefined) updateFields.motherChip = data.motherChip;
    if (data.motherPlaceOfBirth !== undefined) updateFields.motherPlaceOfBirth = data.motherPlaceOfBirth;
    if (data.motherParity !== undefined) updateFields.motherParity = Number(data.motherParity);
    if (data.fatherName !== undefined) updateFields.fatherName = data.fatherName;
    if (data.fatherBreed !== undefined) updateFields.fatherBreed = data.fatherBreed;
    if (data.fatherDOB !== undefined) updateFields.fatherDOB = parseDateFlexible(data.fatherDOB);
    if (data.fatherChip !== undefined) updateFields.fatherChip = data.fatherChip;
    if (data.fatherPlaceOfBirth !== undefined) updateFields.fatherPlaceOfBirth = data.fatherPlaceOfBirth;

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "others.noFieldsToUpdate", event);
    }

    // Include deleted:false in write filter to prevent TOCTOU
    const result = await Pet.updateOne({ _id: petID, deleted: false }, { $set: updateFields });
    if (result.matchedCount === 0) {
      return createErrorResponse(404, "petNotFound", event);
    }

    return createSuccessResponse(200, event, {
      form: updateFields,
      petId: petID,
    });
  } catch (error) {
    logError("Failed to update pet detail info", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { getDetailInfo, updateDetailInfo };
