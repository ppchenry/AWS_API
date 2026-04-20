const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeRecord } = require("../utils/sanitize");
const { isValidDateFormat, parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
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
    const DewormRecords = mongoose.model("Deworm_Records");

    const records = await DewormRecords.find({ petId: petID })
      .select("date vaccineBrand vaccineType typesOfInternalParasites typesOfExternalParasites frequency nextDewormDate notification petId")
      .lean();

    return createSuccessResponse(200, event, {
      message: "dewormRecord.getSuccess",
      form: { deworm: records.map(sanitizeRecord) },
      petId: petID,
    });
  } catch (error) {
    logError("Failed to get deworm records", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * POST /pets/{petID}/deworm-record
 */
async function createDewormRecord({ event, body }) {
  const scope = "services.deworm.createDewormRecord";
  try {
    const petID = event.pathParameters.petID;

    const parseResult = createDewormRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.date && !isValidDateFormat(data.date)) {
      return createErrorResponse(400, "dewormRecord.invalidDateFormat", event);
    }
    if (data.nextDewormDate && !isValidDateFormat(data.nextDewormDate)) {
      return createErrorResponse(400, "dewormRecord.invalidDateFormat", event);
    }

    const DewormRecords = mongoose.model("Deworm_Records");
    const Pets = mongoose.model("Pet");

    const newRecord = await DewormRecords.create({
      date: data.date ? parseDDMMYYYY(data.date) : null,
      vaccineBrand: data.vaccineBrand,
      vaccineType: data.vaccineType,
      typesOfInternalParasites: data.typesOfInternalParasites,
      typesOfExternalParasites: data.typesOfExternalParasites,
      frequency: data.frequency,
      nextDewormDate: data.nextDewormDate ? parseDDMMYYYY(data.nextDewormDate) : null,
      notification: data.notification || false,
      petId: petID,
    });

    await Pets.findByIdAndUpdate(petID, {
      $inc: { dewormRecordsCount: 1 },
      $max: { latestDewormDate: data.date },
    });

    return createSuccessResponse(200, event, {
      message: "dewormRecord.postSuccess",
      form: data,
      petId: petID,
      dewormRecordId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create deworm record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
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

    const parseResult = updateDewormRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.date && !isValidDateFormat(data.date)) {
      return createErrorResponse(400, "dewormRecord.invalidDateFormat", event);
    }
    if (data.nextDewormDate && !isValidDateFormat(data.nextDewormDate)) {
      return createErrorResponse(400, "dewormRecord.invalidDateFormat", event);
    }

    const DewormRecords = mongoose.model("Deworm_Records");
    const Pets = mongoose.model("Pet");

    const exists = await DewormRecords.findById(dewormID).lean();
    if (!exists) {
      return createErrorResponse(404, "dewormRecord.dewormRecordNotFound", event);
    }

    const updateFields = {};
    if (data.date) updateFields.date = parseDDMMYYYY(data.date);
    if (data.vaccineBrand) updateFields.vaccineBrand = data.vaccineBrand;
    if (data.vaccineType) updateFields.vaccineType = data.vaccineType;
    if (data.typesOfInternalParasites) updateFields.typesOfInternalParasites = data.typesOfInternalParasites;
    if (data.typesOfExternalParasites) updateFields.typesOfExternalParasites = data.typesOfExternalParasites;
    if (data.frequency) updateFields.frequency = data.frequency;
    if (data.nextDewormDate) updateFields.nextDewormDate = parseDDMMYYYY(data.nextDewormDate);
    if (data.notification !== undefined) updateFields.notification = data.notification;

    await DewormRecords.updateOne({ _id: dewormID }, { $set: updateFields });

    const latestDewormRecords = await DewormRecords.find({ petId: petID })
      .sort({ date: -1 })
      .limit(1)
      .lean();

    await Pets.findByIdAndUpdate(petID, {
      latestDewormDate: latestDewormRecords[0]?.date || null,
    });

    return createSuccessResponse(200, event, {
      message: "dewormRecord.putSuccess",
      petId: petID,
      dewormRecordId: dewormID,
    });
  } catch (error) {
    logError("Failed to update deworm record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
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

    const DewormRecords = mongoose.model("Deworm_Records");
    const Pets = mongoose.model("Pet");

    const exists = await DewormRecords.findById(dewormID).lean();
    if (!exists) {
      return createErrorResponse(404, "dewormRecord.dewormRecordNotFound", event);
    }

    await DewormRecords.deleteOne({ _id: dewormID });

    const [count, latest] = await Promise.all([
      DewormRecords.countDocuments({ petId: petID }),
      DewormRecords.find({ petId: petID }).sort({ date: -1 }).limit(1).lean(),
    ]);

    await Pets.findByIdAndUpdate(petID, {
      dewormRecordsCount: count,
      latestDewormDate: latest[0]?.date || null,
    });

    return createSuccessResponse(200, event, {
      message: "dewormRecord.deleteSuccess",
      id: petID,
    });
  } catch (error) {
    logError("Failed to delete deworm record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getDewormRecords,
  createDewormRecord,
  updateDewormRecord,
  deleteDewormRecord,
};
