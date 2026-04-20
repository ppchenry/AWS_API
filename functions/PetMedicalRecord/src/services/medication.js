const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeRecord } = require("../utils/sanitize");
const { isValidDateFormat, parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { loadAuthorizedPet } = require("../middleware/selfAccess");
const {
  createMedicationRecordSchema,
  updateMedicationRecordSchema,
} = require("../zodSchema/medicationSchema");

/**
 * GET /pets/{petID}/medication-record
 */
async function getMedicationRecords({ event }) {
  const scope = "services.medication.getMedicationRecords";
  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;
    const MedicationRecords = mongoose.model("Medication_Records");

    const records = await MedicationRecords.find({ petId: petID })
      .select("medicationDate drugName drugPurpose drugMethod drugRemark allergy petId")
      .lean();

    return createSuccessResponse(200, event, {
      message: "medicationRecord.getSuccess",
      form: { medication: records.map(sanitizeRecord) },
      petId: petID,
    });
  } catch (error) {
    logError("Failed to get medication records", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * POST /pets/{petID}/medication-record
 */
async function createMedicationRecord({ event, body }) {
  const scope = "services.medication.createMedicationRecord";
  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = createMedicationRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;
    if (Object.keys(data).length === 0) {
      return createErrorResponse(400, "medicationRecord.noFieldsToUpdate", event);
    }

    if (data.medicationDate && !isValidDateFormat(data.medicationDate)) {
      return createErrorResponse(400, "medicationRecord.invalidDateFormat", event);
    }

    const MedicationRecords = mongoose.model("Medication_Records");
    const Pets = mongoose.model("Pet");

    const newRecord = await MedicationRecords.create({
      medicationDate: data.medicationDate ? parseDDMMYYYY(data.medicationDate) : null,
      drugName: data.drugName,
      drugPurpose: data.drugPurpose,
      drugMethod: data.drugMethod,
      drugRemark: data.drugRemark,
      allergy: data.allergy ?? false,
      petId: petID,
    });

    await Pets.findOneAndUpdate({ _id: petID, deleted: { $ne: true } }, {
      $inc: { medicationRecordsCount: 1 },
    });

    return createSuccessResponse(200, event, {
      message: "medicationRecord.postSuccess",
      form: sanitizeRecord(newRecord),
      petId: petID,
      medicationRecordId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create medication record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * PUT /pets/{petID}/medication-record/{medicationID}
 */
async function updateMedicationRecord({ event, body }) {
  const scope = "services.medication.updateMedicationRecord";
  try {
    const petID = event.pathParameters.petID;
    const medicationID = event.pathParameters.medicationID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = updateMedicationRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    if (data.medicationDate && !isValidDateFormat(data.medicationDate)) {
      return createErrorResponse(400, "medicationRecord.invalidDateFormat", event);
    }

    const MedicationRecords = mongoose.model("Medication_Records");

    const updateFields = {};
    if (data.medicationDate !== undefined) updateFields.medicationDate = data.medicationDate ? parseDDMMYYYY(data.medicationDate) : null;
    if (data.drugName !== undefined) updateFields.drugName = data.drugName;
    if (data.drugPurpose !== undefined) updateFields.drugPurpose = data.drugPurpose;
    if (data.drugMethod !== undefined) updateFields.drugMethod = data.drugMethod;
    if (data.drugRemark !== undefined) updateFields.drugRemark = data.drugRemark;
    if (data.allergy !== undefined) updateFields.allergy = data.allergy;

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "medicationRecord.noFieldsToUpdate", event);
    }

    const updated = await MedicationRecords.findOneAndUpdate(
      { _id: medicationID, petId: petID },
      { $set: updateFields },
      { new: true, projection: "medicationDate drugName drugPurpose drugMethod drugRemark allergy petId" }
    ).lean();

    if (!updated) {
      return createErrorResponse(404, "medicationRecord.medicationRecordNotFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "medicationRecord.putSuccess",
      petId: petID,
      medicationRecordId: medicationID,
      form: sanitizeRecord(updated),
    });
  } catch (error) {
    logError("Failed to update medication record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * DELETE /pets/{petID}/medication-record/{medicationID}
 */
async function deleteMedicationRecord({ event }) {
  const scope = "services.medication.deleteMedicationRecord";
  try {
    const petID = event.pathParameters.petID;
    const medicationID = event.pathParameters.medicationID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const MedicationRecords = mongoose.model("Medication_Records");
    const Pets = mongoose.model("Pet");

    const deleted = await MedicationRecords.deleteOne({ _id: medicationID, petId: petID });

    if (deleted.deletedCount === 0) {
      return createErrorResponse(404, "medicationRecord.medicationRecordNotFound", event);
    }

    const count = await MedicationRecords.countDocuments({ petId: petID });
    await Pets.findByIdAndUpdate(petID, { medicationRecordsCount: count });

    return createSuccessResponse(200, event, {
      message: "medicationRecord.deleteSuccess",
      id: petID,
    });
  } catch (error) {
    logError("Failed to delete medication record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getMedicationRecords,
  createMedicationRecord,
  updateMedicationRecord,
  deleteMedicationRecord,
};
