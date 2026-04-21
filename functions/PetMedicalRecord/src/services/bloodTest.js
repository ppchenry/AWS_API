const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeRecord } = require("../utils/sanitize");
const { isValidDateFormat, parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { loadAuthorizedPet } = require("../middleware/selfAccess");
const {
  createBloodTestSchema,
  updateBloodTestSchema,
} = require("../zodSchema/bloodTestSchema");

async function syncBloodTestPetSummary({
  petId,
  parsedBloodTestDate,
  mode,
  models = {},
}) {
  const BloodTest = models.BloodTest || mongoose.model("blood_tests");
  const Pet = models.Pet || mongoose.model("Pet");

  if (mode === "create") {
    await Pet.findOneAndUpdate(
      { _id: petId, deleted: { $ne: true } },
      {
        $inc: { bloodTestRecordsCount: 1 },
        ...(parsedBloodTestDate ? { $max: { latestBloodTestDate: parsedBloodTestDate } } : {}),
      }
    );
    return;
  }

  const [count, latest] = await Promise.all([
    BloodTest.countDocuments({ petId }),
    BloodTest.find({ petId })
      .select("bloodTestDate")
      .sort({ bloodTestDate: -1 })
      .limit(1)
      .lean(),
  ]);

  await Pet.findByIdAndUpdate(petId, {
    bloodTestRecordsCount: count,
    latestBloodTestDate: latest[0]?.bloodTestDate || null,
  });
}

/**
 * GET /v2/pets/{petID}/blood-test-record
 */
async function getBloodTestRecords({ event }) {
  const scope = "services.bloodTest.getBloodTestRecords";
  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;
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
 * POST /v2/pets/{petID}/blood-test-record
 */
async function createBloodTestRecord({ event, body }) {
  const scope = "services.bloodTest.createBloodTestRecord";
  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = createBloodTestSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;
    if (Object.keys(data).length === 0) {
      return createErrorResponse(400, "bloodTest.noFieldsToUpdate", event);
    }

    if (data.bloodTestDate && !isValidDateFormat(data.bloodTestDate)) {
      return createErrorResponse(400, "bloodTest.invalidDateFormat", event);
    }

    const BloodTest = mongoose.model("blood_tests");
    const parsedBloodTestDate = data.bloodTestDate ? parseDDMMYYYY(data.bloodTestDate) : null;

    const newRecord = await BloodTest.create({
      bloodTestDate: parsedBloodTestDate,
      heartworm: data.heartworm,
      lymeDisease: data.lymeDisease,
      ehrlichiosis: data.ehrlichiosis,
      anaplasmosis: data.anaplasmosis,
      babesiosis: data.babesiosis,
      petId: petID,
    });

    await syncBloodTestPetSummary({
      petId: petID,
      parsedBloodTestDate,
      mode: "create",
    });

    return createSuccessResponse(200, event, {
      message: "bloodTest.postSuccess",
      form: sanitizeRecord(newRecord),
      petId: petID,
      bloodTestRecordId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create blood test record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * PUT /v2/pets/{petID}/blood-test-record/{bloodTestID}
 */
async function updateBloodTestRecord({ event, body }) {
  const scope = "services.bloodTest.updateBloodTestRecord";
  try {
    const petID = event.pathParameters.petID;
    const bloodTestID = event.pathParameters.bloodTestID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = updateBloodTestSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.bloodTestDate && !isValidDateFormat(data.bloodTestDate)) {
      return createErrorResponse(400, "bloodTest.invalidDateFormat", event);
    }

    const BloodTest = mongoose.model("blood_tests");

    const updateFields = {};
    if (data.bloodTestDate !== undefined) updateFields.bloodTestDate = data.bloodTestDate ? parseDDMMYYYY(data.bloodTestDate) : null;
    if (data.heartworm !== undefined) updateFields.heartworm = data.heartworm;
    if (data.lymeDisease !== undefined) updateFields.lymeDisease = data.lymeDisease;
    if (data.ehrlichiosis !== undefined) updateFields.ehrlichiosis = data.ehrlichiosis;
    if (data.anaplasmosis !== undefined) updateFields.anaplasmosis = data.anaplasmosis;
    if (data.babesiosis !== undefined) updateFields.babesiosis = data.babesiosis;

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "bloodTest.noFieldsToUpdate", event);
    }

    const updated = await BloodTest.findOneAndUpdate(
      { _id: bloodTestID, petId: petID },
      { $set: updateFields },
      {
        new: true,
        projection: "bloodTestDate heartworm lymeDisease ehrlichiosis anaplasmosis babesiosis petId",
      }
    ).lean();

    if (!updated) {
      return createErrorResponse(404, "bloodTest.bloodTestRecordNotFound", event);
    }

    await syncBloodTestPetSummary({ petId: petID, mode: "recalculate" });

    return createSuccessResponse(200, event, {
      message: "bloodTest.putSuccess",
      petId: petID,
      bloodTestRecordId: bloodTestID,
      form: sanitizeRecord(updated),
    });
  } catch (error) {
    logError("Failed to update blood test record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * DELETE /v2/pets/{petID}/blood-test-record/{bloodTestID}
 */
async function deleteBloodTestRecord({ event }) {
  const scope = "services.bloodTest.deleteBloodTestRecord";
  try {
    const petID = event.pathParameters.petID;
    const bloodTestID = event.pathParameters.bloodTestID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const BloodTest = mongoose.model("blood_tests");

    const deleted = await BloodTest.deleteOne({ _id: bloodTestID, petId: petID });

    if (deleted.deletedCount === 0) {
      return createErrorResponse(404, "bloodTest.bloodTestRecordNotFound", event);
    }

    await syncBloodTestPetSummary({ petId: petID, mode: "recalculate" });

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
  syncBloodTestPetSummary,
};
