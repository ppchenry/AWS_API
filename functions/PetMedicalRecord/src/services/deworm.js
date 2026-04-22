const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeRecord } = require("../utils/sanitize");
const { isValidDateFormat, parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { loadAuthorizedPet } = require("../middleware/selfAccess");
const {
  createDewormRecordSchema,
  updateDewormRecordSchema,
} = require("../zodSchema/dewormSchema");

/**
 * GET /pets/{petID}/deworm-record
 */
async function getDewormRecords({ event }) {
  const scope = "services.deworm.getDewormRecords";
  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;
    const DewormRecords = mongoose.model("Deworm_Records");

    const records = await DewormRecords.find({ petId: petID })
      .select("date vaccineBrand vaccineType typesOfInternalParasites typesOfExternalParasites frequency nextDewormDate notification petId")
      .lean();

    return createSuccessResponse(200, event, {
      message: "petMedicalRecord.success.dewormRecord.getSuccess",
      form: { deworm: records.map(sanitizeRecord) },
      petId: petID,
    });
  } catch (error) {
    logError("Failed to get deworm records", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * POST /pets/{petID}/deworm-record
 */
async function createDewormRecord({ event, body }) {
  const scope = "services.deworm.createDewormRecord";
  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = createDewormRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;
    if (Object.keys(data).length === 0) {
      return createErrorResponse(400, "petMedicalRecord.errors.dewormRecord.noFieldsToUpdate", event);
    }

    if (data.date && !isValidDateFormat(data.date)) {
      return createErrorResponse(400, "petMedicalRecord.errors.dewormRecord.invalidDateFormat", event);
    }
    if (data.nextDewormDate && !isValidDateFormat(data.nextDewormDate)) {
      return createErrorResponse(400, "petMedicalRecord.errors.dewormRecord.invalidDateFormat", event);
    }

    const DewormRecords = mongoose.model("Deworm_Records");
    const Pets = mongoose.model("Pet");

    const parsedDate = data.date ? parseDDMMYYYY(data.date) : null;
    const parsedNextDewormDate = data.nextDewormDate ? parseDDMMYYYY(data.nextDewormDate) : null;

    const newRecord = await DewormRecords.create({
      date: parsedDate,
      vaccineBrand: data.vaccineBrand,
      vaccineType: data.vaccineType,
      typesOfInternalParasites: data.typesOfInternalParasites,
      typesOfExternalParasites: data.typesOfExternalParasites,
      frequency: data.frequency,
      nextDewormDate: parsedNextDewormDate,
      notification: data.notification ?? false,
      petId: petID,
    });

    await Pets.findOneAndUpdate({ _id: petID, deleted: { $ne: true } }, {
      $inc: { dewormRecordsCount: 1 },
      $max: { latestDewormDate: parsedDate },
    });

    return createSuccessResponse(200, event, {
      message: "petMedicalRecord.success.dewormRecord.created",
      form: sanitizeRecord(newRecord),
      petId: petID,
      dewormRecordId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create deworm record", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * PUT /pets/{petID}/deworm-record/{dewormID}
 */
async function updateDewormRecord({ event, body }) {
  const scope = "services.deworm.updateDewormRecord";
  try {
    const petID = event.pathParameters.petID;
    const dewormID = event.pathParameters.dewormID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = updateDewormRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.date && !isValidDateFormat(data.date)) {
      return createErrorResponse(400, "petMedicalRecord.errors.dewormRecord.invalidDateFormat", event);
    }
    if (data.nextDewormDate && !isValidDateFormat(data.nextDewormDate)) {
      return createErrorResponse(400, "petMedicalRecord.errors.dewormRecord.invalidDateFormat", event);
    }

    const DewormRecords = mongoose.model("Deworm_Records");
    const Pets = mongoose.model("Pet");

    const updateFields = {};
    if (data.date !== undefined) updateFields.date = data.date ? parseDDMMYYYY(data.date) : null;
    if (data.vaccineBrand !== undefined) updateFields.vaccineBrand = data.vaccineBrand;
    if (data.vaccineType !== undefined) updateFields.vaccineType = data.vaccineType;
    if (data.typesOfInternalParasites !== undefined) updateFields.typesOfInternalParasites = data.typesOfInternalParasites;
    if (data.typesOfExternalParasites !== undefined) updateFields.typesOfExternalParasites = data.typesOfExternalParasites;
    if (data.frequency !== undefined) updateFields.frequency = data.frequency;
    if (data.nextDewormDate !== undefined) updateFields.nextDewormDate = data.nextDewormDate ? parseDDMMYYYY(data.nextDewormDate) : null;
    if (data.notification !== undefined) updateFields.notification = data.notification;

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "petMedicalRecord.errors.dewormRecord.noFieldsToUpdate", event);
    }

    const updated = await DewormRecords.findOneAndUpdate(
      { _id: dewormID, petId: petID },
      { $set: updateFields },
      {
        new: true,
        projection: "date vaccineBrand vaccineType typesOfInternalParasites typesOfExternalParasites frequency nextDewormDate notification petId",
      }
    ).lean();

    if (!updated) {
      return createErrorResponse(404, "petMedicalRecord.errors.dewormRecord.notFound", event);
    }

    const latestDewormRecords = await DewormRecords.find({ petId: petID })
      .select("date")
      .sort({ date: -1 })
      .limit(1)
      .lean();

    await Pets.findByIdAndUpdate(petID, {
      latestDewormDate: latestDewormRecords[0]?.date || null,
    });

    return createSuccessResponse(200, event, {
      message: "petMedicalRecord.success.dewormRecord.updated",
      petId: petID,
      dewormRecordId: dewormID,
      form: sanitizeRecord(updated),
    });
  } catch (error) {
    logError("Failed to update deworm record", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * DELETE /pets/{petID}/deworm-record/{dewormID}
 */
async function deleteDewormRecord({ event }) {
  const scope = "services.deworm.deleteDewormRecord";
  try {
    const petID = event.pathParameters.petID;
    const dewormID = event.pathParameters.dewormID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const DewormRecords = mongoose.model("Deworm_Records");
    const Pets = mongoose.model("Pet");

    const deleted = await DewormRecords.deleteOne({ _id: dewormID, petId: petID });

    if (deleted.deletedCount === 0) {
      return createErrorResponse(404, "petMedicalRecord.errors.dewormRecord.notFound", event);
    }

    const [count, latest] = await Promise.all([
      DewormRecords.countDocuments({ petId: petID }),
      DewormRecords.find({ petId: petID }).select("date").sort({ date: -1 }).limit(1).lean(),
    ]);

    await Pets.findByIdAndUpdate(petID, {
      dewormRecordsCount: count,
      latestDewormDate: latest[0]?.date || null,
    });

    return createSuccessResponse(200, event, {
      message: "petMedicalRecord.success.dewormRecord.deleted",
      id: petID,
    });
  } catch (error) {
    logError("Failed to delete deworm record", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = {
  getDewormRecords,
  createDewormRecord,
  updateDewormRecord,
  deleteDewormRecord,
};
