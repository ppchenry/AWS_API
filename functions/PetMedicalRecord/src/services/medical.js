const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeRecord } = require("../utils/sanitize");
const { isValidDateFormat, parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const {
  createMedicalRecordSchema,
  updateMedicalRecordSchema,
} = require("../zodSchema/medicalSchema");

/**
 * GET /pets/{petID}/medical-record
 */
async function getMedicalRecords({ event }) {
  const scope = "services.medical.getMedicalRecords";
  try {
    const petID = event.pathParameters.petID;
    const MedicalRecords = mongoose.model("Medical_Records");

    const records = await MedicalRecords.find({ petId: petID })
      .select("medicalDate medicalPlace medicalDoctor medicalResult medicalSolution petId")
      .lean();

    return createSuccessResponse(200, event, {
      message: "medicalRecord.getSuccess",
      form: { medical: records.map(sanitizeRecord) },
      petId: petID,
    });
  } catch (error) {
    logError("Failed to get medical records", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * POST /pets/{petID}/medical-record
 */
async function createMedicalRecord({ event, body }) {
  const scope = "services.medical.createMedicalRecord";
  try {
    const petID = event.pathParameters.petID;

    const parseResult = createMedicalRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.medicalDate && !isValidDateFormat(data.medicalDate)) {
      return createErrorResponse(400, "medicalRecord.invalidDateFormat", event);
    }

    const MedicalRecords = mongoose.model("Medical_Records");
    const Pets = mongoose.model("Pet");

    const newRecord = await MedicalRecords.create({
      medicalDate: data.medicalDate ? parseDDMMYYYY(data.medicalDate) : null,
      medicalPlace: data.medicalPlace,
      medicalDoctor: data.medicalDoctor,
      medicalResult: data.medicalResult,
      medicalSolution: data.medicalSolution,
      petId: petID,
    });

    await Pets.findByIdAndUpdate(petID, {
      $inc: { medicalRecordsCount: 1 },
    });

    return createSuccessResponse(200, event, {
      message: "medicalRecord.postSuccess",
      form: data,
      petId: petID,
      medicalRecordId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create medical record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * PUT /pets/{petID}/medical-record/{medicalID}
 */
async function updateMedicalRecord({ event, body }) {
  const scope = "services.medical.updateMedicalRecord";
  try {
    const petID = event.pathParameters.petID;
    const medicalID = event.pathParameters.medicalID;

    const parseResult = updateMedicalRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.medicalDate && !isValidDateFormat(data.medicalDate)) {
      return createErrorResponse(400, "medicalRecord.invalidDateFormat", event);
    }

    const MedicalRecords = mongoose.model("Medical_Records");

    const exists = await MedicalRecords.findById(medicalID).lean();
    if (!exists) {
      return createErrorResponse(404, "medicalRecord.medicalRecordNotFound", event);
    }

    const updateFields = {};
    if (data.medicalDate) updateFields.medicalDate = parseDDMMYYYY(data.medicalDate);
    if (data.medicalPlace) updateFields.medicalPlace = data.medicalPlace;
    if (data.medicalDoctor) updateFields.medicalDoctor = data.medicalDoctor;
    if (data.medicalResult) updateFields.medicalResult = data.medicalResult;
    if (data.medicalSolution) updateFields.medicalSolution = data.medicalSolution;

    await MedicalRecords.updateOne({ _id: medicalID }, { $set: updateFields });

    return createSuccessResponse(200, event, {
      message: "medicalRecord.putSuccess",
      petId: petID,
      medicalRecordId: medicalID,
    });
  } catch (error) {
    logError("Failed to update medical record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * DELETE /pets/{petID}/medical-record/{medicalID}
 */
async function deleteMedicalRecord({ event }) {
  const scope = "services.medical.deleteMedicalRecord";
  try {
    const petID = event.pathParameters.petID;
    const medicalID = event.pathParameters.medicalID;

    const MedicalRecords = mongoose.model("Medical_Records");
    const Pets = mongoose.model("Pet");

    const deleted = await MedicalRecords.deleteOne({ _id: medicalID });

    if (deleted.deletedCount === 0) {
      return createErrorResponse(404, "medicalRecord.medicalRecordNotFound", event);
    }

    const count = await MedicalRecords.countDocuments({ petId: petID });
    await Pets.findByIdAndUpdate(petID, { medicalRecordsCount: count });

    return createSuccessResponse(200, event, {
      message: "medicalRecord.deleteSuccess",
      id: petID,
    });
  } catch (error) {
    logError("Failed to delete medical record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getMedicalRecords,
  createMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
};
