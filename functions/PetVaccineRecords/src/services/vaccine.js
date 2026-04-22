const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeVaccineRecord } = require("../utils/sanitize");
const { isValidDateFormat, parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { loadAuthorizedPet } = require("../middleware/selfAccess");
const {
  createVaccineRecordSchema,
  updateVaccineRecordSchema,
} = require("../zodSchema/vaccineSchema");

const ACTIVE_VACCINE_FILTER = { isDeleted: { $ne: true } };

async function getVaccineRecords({ event }) {
  const scope = "services.vaccine.getVaccineRecords";

  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const VaccineRecords = mongoose.model("Vaccine_Records");
    const vaccineRecords = await VaccineRecords.find({ petId: petID, ...ACTIVE_VACCINE_FILTER })
      .select("vaccineDate vaccineName vaccineNumber vaccineTimes vaccinePosition petId")
      .lean();

    return createSuccessResponse(200, event, {
      message: "vaccineRecord.getSuccess",
      form: {
        vaccineRecords: vaccineRecords.map(sanitizeVaccineRecord),
      },
      petId: petID,
    });
  } catch (error) {
    logError("Failed to get vaccine records", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function createVaccineRecord({ event, body }) {
  const scope = "services.vaccine.createVaccineRecord";

  try {
    const petID = event.pathParameters.petID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = createVaccineRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const data = parseResult.data;
    if (Object.keys(data).length === 0) {
      return createErrorResponse(400, "vaccineRecord.noFieldsToUpdate", event);
    }

    if (data.vaccineDate && !isValidDateFormat(data.vaccineDate)) {
      return createErrorResponse(400, "vaccineRecord.invalidDateFormat", event);
    }

    const VaccineRecords = mongoose.model("Vaccine_Records");
    const Pets = mongoose.model("Pet");
    const vaccineRecord = await VaccineRecords.create({
      petId: petID,
      vaccineDate: data.vaccineDate ? parseDDMMYYYY(data.vaccineDate) : null,
      vaccineName: data.vaccineName,
      vaccineNumber: data.vaccineNumber,
      vaccineTimes: data.vaccineTimes,
      vaccinePosition: data.vaccinePosition,
    });

    const [count, latest] = await Promise.all([
      VaccineRecords.countDocuments({ petId: petID, ...ACTIVE_VACCINE_FILTER }),
      VaccineRecords.find({ petId: petID, ...ACTIVE_VACCINE_FILTER })
        .select("vaccineDate")
        .sort({ vaccineDate: -1 })
        .limit(1)
        .lean(),
    ]);

    await Pets.findByIdAndUpdate(petID, {
      vaccineRecordsCount: count,
      latestVaccineDate: latest[0]?.vaccineDate || null,
    });

    return createSuccessResponse(200, event, {
      message: "vaccineRecord.postSuccess",
      form: sanitizeVaccineRecord(vaccineRecord),
      petId: petID,
      vaccineId: vaccineRecord._id,
    });
  } catch (error) {
    logError("Failed to create vaccine record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function updateVaccineRecord({ event, body }) {
  const scope = "services.vaccine.updateVaccineRecord";

  try {
    const petID = event.pathParameters.petID;
    const vaccineID = event.pathParameters.vaccineID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const parseResult = updateVaccineRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const data = parseResult.data;
    if (Object.keys(data).length === 0) {
      return createErrorResponse(400, "vaccineRecord.noFieldsToUpdate", event);
    }

    if (data.vaccineDate && !isValidDateFormat(data.vaccineDate)) {
      return createErrorResponse(400, "vaccineRecord.invalidDateFormat", event);
    }

    const VaccineRecords = mongoose.model("Vaccine_Records");
    const Pets = mongoose.model("Pet");
    const updateFields = {};

    if (data.vaccineDate !== undefined) {
      updateFields.vaccineDate = data.vaccineDate ? parseDDMMYYYY(data.vaccineDate) : null;
    }
    if (data.vaccineName !== undefined) updateFields.vaccineName = data.vaccineName;
    if (data.vaccineNumber !== undefined) updateFields.vaccineNumber = data.vaccineNumber;
    if (data.vaccineTimes !== undefined) updateFields.vaccineTimes = data.vaccineTimes;
    if (data.vaccinePosition !== undefined) updateFields.vaccinePosition = data.vaccinePosition;

    const updated = await VaccineRecords.findOneAndUpdate(
      { _id: vaccineID, petId: petID, ...ACTIVE_VACCINE_FILTER },
      { $set: updateFields },
      {
        new: true,
        projection: "vaccineDate vaccineName vaccineNumber vaccineTimes vaccinePosition petId",
      }
    ).lean();

    if (!updated) {
      return createErrorResponse(404, "vaccineRecord.vaccineRecordNotFound", event);
    }

    const latest = await VaccineRecords.find({ petId: petID, ...ACTIVE_VACCINE_FILTER })
      .select("vaccineDate")
      .sort({ vaccineDate: -1 })
      .limit(1)
      .lean();

    await Pets.findByIdAndUpdate(petID, {
      latestVaccineDate: latest[0]?.vaccineDate || null,
    });

    return createSuccessResponse(200, event, {
      message: "vaccineRecord.putSuccess",
      petId: petID,
      vaccineId: vaccineID,
      form: sanitizeVaccineRecord(updated),
    });
  } catch (error) {
    logError("Failed to update vaccine record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function deleteVaccineRecord({ event }) {
  const scope = "services.vaccine.deleteVaccineRecord";

  try {
    const petID = event.pathParameters.petID;
    const vaccineID = event.pathParameters.vaccineID;
    const petAccess = await loadAuthorizedPet({ event, petId: petID });
    if (!petAccess.isValid) return petAccess.error;

    const VaccineRecords = mongoose.model("Vaccine_Records");
    const Pets = mongoose.model("Pet");

    const deleted = await VaccineRecords.findOneAndUpdate(
      { _id: vaccineID, petId: petID, ...ACTIVE_VACCINE_FILTER },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true, projection: "_id" }
    ).lean();

    if (!deleted) {
      return createErrorResponse(404, "vaccineRecord.vaccineRecordNotFound", event);
    }

    const [count, latest] = await Promise.all([
      VaccineRecords.countDocuments({ petId: petID, ...ACTIVE_VACCINE_FILTER }),
      VaccineRecords.find({ petId: petID, ...ACTIVE_VACCINE_FILTER })
        .select("vaccineDate")
        .sort({ vaccineDate: -1 })
        .limit(1)
        .lean(),
    ]);

    await Pets.findByIdAndUpdate(petID, {
      vaccineRecordsCount: count,
      latestVaccineDate: latest[0]?.vaccineDate || null,
    });

    return createSuccessResponse(200, event, {
      message: "vaccineRecord.deleteSuccess",
      id: petAccess.pet._id,
    });
  } catch (error) {
    logError("Failed to delete vaccine record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  getVaccineRecords,
  createVaccineRecord,
  updateVaccineRecord,
  deleteVaccineRecord,
};