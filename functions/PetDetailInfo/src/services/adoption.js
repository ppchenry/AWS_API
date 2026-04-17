const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { sanitizeAdoption } = require("../utils/sanitize");
const { parseDateFlexible, isValidDateFormat } = require("../utils/validators");
const { checkDuplicates } = require("../utils/duplicateCheck");
const { adoptionCreateSchema, adoptionUpdateSchema } = require("../zodSchema/adoptionSchema");

const ADOPTION_PROJECTION = "_id petId postAdoptionName isNeutered NeuteredDate firstVaccinationDate secondVaccinationDate thirdVaccinationDate followUpMonth1 followUpMonth2 followUpMonth3 followUpMonth4 followUpMonth5 followUpMonth6 followUpMonth7 followUpMonth8 followUpMonth9 followUpMonth10 followUpMonth11 followUpMonth12 createdAt updatedAt";

const DATE_FIELDS = ["NeuteredDate", "firstVaccinationDate", "secondVaccinationDate", "thirdVaccinationDate"];

function validateAdoptionDates(data) {
  for (const field of DATE_FIELDS) {
    if (data[field] && !isValidDateFormat(data[field])) {
      return field;
    }
  }
  return null;
}

async function getAdoption({ event }) {
  const scope = "services.adoption.getAdoption";
  try {
    const petID = event.pathParameters.petID;
    const AdoptionModel = mongoose.model("pet_adoptions");

    const record = await AdoptionModel.findOne({ petId: petID })
      .select(ADOPTION_PROJECTION)
      .lean();

    if (!record) {
      return createSuccessResponse(200, event, {
        form: null,
        petId: petID,
      });
    }

    return createSuccessResponse(200, event, {
      form: sanitizeAdoption(record),
      petId: petID,
      adoptionId: record._id,
    });
  } catch (error) {
    logError("Failed to get adoption record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function createAdoption({ event, body }) {
  const scope = "services.adoption.createAdoption";
  try {
    const petID = event.pathParameters.petID;
    const AdoptionModel = mongoose.model("pet_adoptions");

    // Zod validation first
    const parseResult = adoptionCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Validate date fields
    const invalidDateField = validateAdoptionDates(data);
    if (invalidDateField) {
      return createErrorResponse(400, "petAdoption.invalidDateFormat", event);
    }

    // Check for duplicate — only one adoption record per pet
    const dup = await checkDuplicates(
      { pet_adoptions: AdoptionModel },
      [{ model: "pet_adoptions", path: "petId", value: petID, label: "petAdoption.duplicateRecord" }],
    );
    if (!dup.ok) {
      return createErrorResponse(409, "petAdoption.duplicateRecord", event);
    }

    const newRecord = await AdoptionModel.create({
      petId: petID,
      postAdoptionName: data.postAdoptionName || null,
      isNeutered: data.isNeutered ?? null,
      NeuteredDate: data.NeuteredDate ? parseDateFlexible(data.NeuteredDate) : null,
      firstVaccinationDate: data.firstVaccinationDate ? parseDateFlexible(data.firstVaccinationDate) : null,
      secondVaccinationDate: data.secondVaccinationDate ? parseDateFlexible(data.secondVaccinationDate) : null,
      thirdVaccinationDate: data.thirdVaccinationDate ? parseDateFlexible(data.thirdVaccinationDate) : null,
      followUpMonth1: data.followUpMonth1 ?? false,
      followUpMonth2: data.followUpMonth2 ?? false,
      followUpMonth3: data.followUpMonth3 ?? false,
      followUpMonth4: data.followUpMonth4 ?? false,
      followUpMonth5: data.followUpMonth5 ?? false,
      followUpMonth6: data.followUpMonth6 ?? false,
      followUpMonth7: data.followUpMonth7 ?? false,
      followUpMonth8: data.followUpMonth8 ?? false,
      followUpMonth9: data.followUpMonth9 ?? false,
      followUpMonth10: data.followUpMonth10 ?? false,
      followUpMonth11: data.followUpMonth11 ?? false,
      followUpMonth12: data.followUpMonth12 ?? false,
    });

    return createSuccessResponse(201, event, {
      form: sanitizeAdoption(newRecord),
      petId: petID,
      adoptionId: newRecord._id,
    });
  } catch (error) {
    logError("Failed to create adoption record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function updateAdoption({ event, body }) {
  const scope = "services.adoption.updateAdoption";
  try {
    const petID = event.pathParameters.petID;
    const adoptionId = event.pathParameters.adoptionId;
    const AdoptionModel = mongoose.model("pet_adoptions");

    // Zod validation first (before any DB work)
    const parseResult = adoptionUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Validate date fields
    const invalidDateField = validateAdoptionDates(data);
    if (invalidDateField) {
      return createErrorResponse(400, "petAdoption.invalidDateFormat", event);
    }

    // Verify adoption record exists and belongs to this pet
    const existing = await AdoptionModel.findOne({ _id: adoptionId, petId: petID }).select("_id").lean();
    if (!existing) {
      return createErrorResponse(404, "petAdoption.recordNotFound", event);
    }

    const updateFields = {};
    if (data.postAdoptionName !== undefined) updateFields.postAdoptionName = data.postAdoptionName;
    if (data.isNeutered !== undefined) updateFields.isNeutered = data.isNeutered;
    if (data.NeuteredDate !== undefined) updateFields.NeuteredDate = data.NeuteredDate ? parseDateFlexible(data.NeuteredDate) : null;
    if (data.firstVaccinationDate !== undefined) updateFields.firstVaccinationDate = data.firstVaccinationDate ? parseDateFlexible(data.firstVaccinationDate) : null;
    if (data.secondVaccinationDate !== undefined) updateFields.secondVaccinationDate = data.secondVaccinationDate ? parseDateFlexible(data.secondVaccinationDate) : null;
    if (data.thirdVaccinationDate !== undefined) updateFields.thirdVaccinationDate = data.thirdVaccinationDate ? parseDateFlexible(data.thirdVaccinationDate) : null;

    for (let i = 1; i <= 12; i++) {
      const key = `followUpMonth${i}`;
      if (data[key] !== undefined) {
        updateFields[key] = !!data[key];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return createErrorResponse(400, "petAdoption.noFieldsToUpdate", event);
    }

    const result = await AdoptionModel.updateOne({ _id: adoptionId, petId: petID }, { $set: updateFields });
    if (result.matchedCount === 0) {
      return createErrorResponse(404, "petAdoption.recordNotFound", event);
    }

    return createSuccessResponse(200, event, {
      petId: petID,
      adoptionId: adoptionId,
    });
  } catch (error) {
    logError("Failed to update adoption record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

async function deleteAdoption({ event }) {
  const scope = "services.adoption.deleteAdoption";
  try {
    const petID = event.pathParameters.petID;
    const adoptionId = event.pathParameters.adoptionId;
    const AdoptionModel = mongoose.model("pet_adoptions");

    // Ownership already verified by middleware; delete with petId filter
    const deleted = await AdoptionModel.deleteOne({ _id: adoptionId, petId: petID });

    if (deleted.deletedCount === 0) {
      return createErrorResponse(404, "petAdoption.recordNotFound", event);
    }

    return createSuccessResponse(200, event, {
      petId: petID,
      adoptionId: adoptionId,
    });
  } catch (error) {
    logError("Failed to delete adoption record", { scope, event, error });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { getAdoption, createAdoption, updateAdoption, deleteAdoption };
