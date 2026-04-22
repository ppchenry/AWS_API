const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { parseDateFlexible, isValidDateFormat } = require("../utils/validators");
const { transferCreateSchema, transferUpdateSchema } = require("../zodSchema/transferSchema");

async function createTransfer({ event, body }) {
  const scope = "services.transfer.createTransfer";
  try {
    const petID = event.pathParameters.petID;
    const Pet = mongoose.model("Pet");

    // Zod validation
    const parseResult = transferCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Validate date format if provided
    if (data.regDate && !isValidDateFormat(data.regDate)) {
      return createErrorResponse(400, "petDetailInfo.errors.transferPath.invalidDateFormat", event);
    }

    const transferRecordId = new mongoose.Types.ObjectId();
    const newTransferRecord = {
      _id: transferRecordId,
      regDate: data.regDate ? parseDateFlexible(data.regDate) : null,
      regPlace: data.regPlace || null,
      transferOwner: data.transferOwner || null,
      transferContact: data.transferContact || null,
      transferRemark: data.transferRemark || "",
    };

    // Include deleted:false in write filter
    const result = await Pet.updateOne(
      { _id: petID, deleted: false },
      { $push: { transfer: newTransferRecord } }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse(404, "petDetailInfo.errors.petNotFound", event);
    }

    return createSuccessResponse(200, event, {
      form: newTransferRecord,
      petId: petID,
      transferId: transferRecordId,
    });
  } catch (error) {
    logError("Failed to create transfer record", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

async function updateTransfer({ event, body }) {
  const scope = "services.transfer.updateTransfer";
  try {
    const petID = event.pathParameters.petID;
    const transferId = event.pathParameters.transferId;
    const Pet = mongoose.model("Pet");

    // Zod validation first (before any DB work)
    const parseResult = transferUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Validate date format if provided
    if (data.regDate && !isValidDateFormat(data.regDate)) {
      return createErrorResponse(400, "petDetailInfo.errors.transferPath.invalidDateFormat", event);
    }

    // Verify the transfer sub-document exists on this pet
    const pet = await Pet.findOne(
      { _id: petID, deleted: false, "transfer._id": transferId },
    ).select("_id").lean();

    if (!pet) {
      return createErrorResponse(404, "petDetailInfo.errors.transferPath.notFound", event);
    }

    // Build positional update
    const updateFields = {};
    if (data.regDate !== undefined) updateFields["transfer.$.regDate"] = parseDateFlexible(data.regDate);
    if (data.regPlace !== undefined) updateFields["transfer.$.regPlace"] = data.regPlace;
    if (data.transferOwner !== undefined) updateFields["transfer.$.transferOwner"] = data.transferOwner;
    if (data.transferContact !== undefined) updateFields["transfer.$.transferContact"] = data.transferContact;
    if (data.transferRemark !== undefined) updateFields["transfer.$.transferRemark"] = data.transferRemark;

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "common.noFieldsToUpdate", event);
    }

    // Include deleted:false in write filter
    const result = await Pet.updateOne(
      { _id: petID, deleted: false, "transfer._id": transferId },
      { $set: updateFields }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse(404, "petDetailInfo.errors.transferPath.notFound", event);
    }

    return createSuccessResponse(200, event, {
      form: data,
      petId: petID,
      transferId: transferId,
    });
  } catch (error) {
    logError("Failed to update transfer record", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

async function deleteTransfer({ event }) {
  const scope = "services.transfer.deleteTransfer";
  try {
    const petID = event.pathParameters.petID;
    const transferId = event.pathParameters.transferId;
    const Pet = mongoose.model("Pet");

    // Include full predicate in write filter and verify result
    const result = await Pet.updateOne(
      { _id: petID, deleted: false, "transfer._id": transferId },
      { $pull: { transfer: { _id: transferId } } }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse(404, "petDetailInfo.errors.transferPath.notFound", event);
    }

    return createSuccessResponse(200, event, {
      petId: petID,
      transferId: transferId,
    });
  } catch (error) {
    logError("Failed to delete transfer record", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { createTransfer, updateTransfer, deleteTransfer };
