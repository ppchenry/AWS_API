const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { sanitizeSource } = require("../utils/sanitize");
const { checkDuplicates } = require("../utils/duplicateCheck");
const { sourceCreateSchema, sourceUpdateSchema } = require("../zodSchema/sourceSchema");

async function getSource({ event }) {
  const scope = "services.source.getSource";
  try {
    const petID = event.pathParameters.petID;
    const SourceModel = mongoose.model("pet_sources");

    const record = await SourceModel.findOne({ petId: petID })
      .select("_id placeofOrigin channel rescueCategory causeOfInjury createdAt updatedAt")
      .lean();

    if (!record) {
      return createSuccessResponse(200, event, {
        form: null,
        petId: petID,
      });
    }

    return createSuccessResponse(200, event, {
      form: sanitizeSource(record),
      petId: petID,
      sourceId: record._id,
    });
  } catch (error) {
    logError("Failed to get source info", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function createSource({ event, body }) {
  const scope = "services.source.createSource";
  try {
    const petID = event.pathParameters.petID;
    const SourceModel = mongoose.model("pet_sources");

    // Zod validation first
    const parseResult = sourceCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Check for duplicate — only one source record per pet
    const dup = await checkDuplicates(
      { pet_sources: SourceModel },
      [{ model: "pet_sources", path: "petId", value: petID, label: "petSource.duplicateRecord" }],
    );
    if (!dup.ok) {
      return createErrorResponse(409, "petSource.duplicateRecord", event);
    }

    const newRecord = await SourceModel.create({
      petId: petID,
      placeofOrigin: data.placeofOrigin || null,
      channel: data.channel || null,
      rescueCategory: data.rescueCategory || [],
      causeOfInjury: data.causeOfInjury || null,
    });

    return createSuccessResponse(201, event, {
      form: sanitizeSource(newRecord),
      petId: petID,
      sourceId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create source record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function updateSource({ event, body }) {
  const scope = "services.source.updateSource";
  try {
    const petID = event.pathParameters.petID;
    const sourceId = event.pathParameters.sourceId;
    const SourceModel = mongoose.model("pet_sources");

    // Zod validation first (before any DB work)
    const parseResult = sourceUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Verify source record exists and belongs to this pet
    const existing = await SourceModel.findOne({ _id: sourceId, petId: petID }).select("_id").lean();
    if (!existing) {
      return createErrorResponse(404, "petSource.recordNotFound", event);
    }

    const updateFields = {};
    if (data.placeofOrigin !== undefined) updateFields.placeofOrigin = data.placeofOrigin;
    if (data.channel !== undefined) updateFields.channel = data.channel;
    if (data.rescueCategory !== undefined) updateFields.rescueCategory = data.rescueCategory;
    if (data.causeOfInjury !== undefined) updateFields.causeOfInjury = data.causeOfInjury;

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "petSource.noFieldsToUpdate", event);
    }

    const result = await SourceModel.updateOne({ _id: sourceId, petId: petID }, { $set: updateFields });
    if (result.matchedCount === 0) {
      return createErrorResponse(404, "petSource.recordNotFound", event);
    }

    return createSuccessResponse(200, event, {
      petId: petID,
      sourceId: sourceId,
    });
  } catch (error) {
    logError("Failed to update source record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { getSource, createSource, updateSource };
