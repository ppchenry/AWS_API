const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeRecord } = require("../utils/sanitize");
const { isValidDateFormat, parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const {
  createBloodTestSchema,
  updateBloodTestSchema,
} = require("../zodSchema/bloodTestSchema");

/**
 * GET /pets/{petID}/blood-test-record
 */
async function getBloodTestRecords({ event }) {
  const scope = "services.bloodTest.getBloodTestRecords";
  try {
    const petID = event.pathParameters.petID;
    const BloodTest = mongoose.model("blood_tests");

    const records = await BloodTest.find({ petId: petID })
      .select("bloodTestDate heartworm lymeDisease ehrlichiosis anaplasmosis babesiosis petId")
      .lean();

    return createSuccessResponse(200, event, {
      message: "bloodTest.getSuccess",
      form: { blood_test: records.map(sanitizeRecord) },
      petId: petID,
    });
  } catch (error) {
    logError("Failed to get blood test records", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * POST /pets/{petID}/blood-test-record
 */
async function createBloodTestRecord({ event, body }) {
  const scope = "services.bloodTest.createBloodTestRecord";
  try {
    const petID = event.pathParameters.petID;

    const parseResult = createBloodTestSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.bloodTestDate && !isValidDateFormat(data.bloodTestDate)) {
      return createErrorResponse(400, "bloodTest.invalidDateFormat", event);
    }

    const BloodTest = mongoose.model("blood_tests");

    const newRecord = await BloodTest.create({
      bloodTestDate: data.bloodTestDate ? parseDDMMYYYY(data.bloodTestDate) : null,
      heartworm: data.heartworm,
      lymeDisease: data.lymeDisease,
      ehrlichiosis: data.ehrlichiosis,
      anaplasmosis: data.anaplasmosis,
      babesiosis: data.babesiosis,
      petId: petID,
    });

    return createSuccessResponse(200, event, {
      message: "bloodTest.postSuccess",
      form: data,
      petId: petID,
      bloodTestRecordId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create blood test record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * PUT /pets/{petID}/blood-test-record/{bloodTestID}
 */
async function updateBloodTestRecord({ event, body }) {
  const scope = "services.bloodTest.updateBloodTestRecord";
  try {
    const petID = event.pathParameters.petID;
    const bloodTestID = event.pathParameters.bloodTestID;

    const parseResult = updateBloodTestSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.bloodTestDate && !isValidDateFormat(data.bloodTestDate)) {
      return createErrorResponse(400, "bloodTest.invalidDateFormat", event);
    }

    const BloodTest = mongoose.model("blood_tests");

    const exists = await BloodTest.findById(bloodTestID).lean();
    if (!exists) {
      return createErrorResponse(404, "bloodTest.bloodTestRecordNotFound", event);
    }

    const updateFields = {};
    if (data.bloodTestDate) updateFields.bloodTestDate = parseDDMMYYYY(data.bloodTestDate);
    if (data.heartworm) updateFields.heartworm = data.heartworm;
    if (data.lymeDisease) updateFields.lymeDisease = data.lymeDisease;
    if (data.ehrlichiosis) updateFields.ehrlichiosis = data.ehrlichiosis;
    if (data.anaplasmosis) updateFields.anaplasmosis = data.anaplasmosis;
    if (data.babesiosis) updateFields.babesiosis = data.babesiosis;

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "bloodTest.noFieldsToUpdate", event);
    }

    await BloodTest.updateOne({ _id: bloodTestID }, { $set: updateFields });

    return createSuccessResponse(200, event, {
      message: "bloodTest.putSuccess",
      petId: petID,
      bloodTestRecordId: bloodTestID,
    });
  } catch (error) {
    logError("Failed to update blood test record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * DELETE /pets/{petID}/blood-test-record/{bloodTestID}
 */
async function deleteBloodTestRecord({ event }) {
  const scope = "services.bloodTest.deleteBloodTestRecord";
  try {
    const petID = event.pathParameters.petID;
    const bloodTestID = event.pathParameters.bloodTestID;

    const BloodTest = mongoose.model("blood_tests");

    const deleted = await BloodTest.deleteOne({ _id: bloodTestID });

    if (deleted.deletedCount === 0) {
      return createErrorResponse(404, "bloodTest.bloodTestRecordNotFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "bloodTest.deleteSuccess",
      petId: petID,
      bloodTestRecordId: bloodTestID,
    });
  } catch (error) {
    logError("Failed to delete blood test record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getBloodTestRecords,
  createBloodTestRecord,
  updateBloodTestRecord,
  deleteBloodTestRecord,
};
