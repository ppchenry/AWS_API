const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getTranslation, loadTranslations } = require("../utils/i18n");
const { logError } = require("../utils/logger");
const { sanitizePet } = require("../utils/sanitize");
const { enforceRateLimit } = require("../utils/rateLimit");
const { parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { createPetSchema } = require("../zodSchema/createPetSchema");

async function createPetBasicInfo({ event, body }) {
  const scope = "services.createPet.createPetBasicInfo";

  try {
    const rateLimit = await enforceRateLimit({
      event,
      action: "createPetBasicInfo",
      identifier: event.userId,
      limit: 20,
      windowSec: 300,
    });

    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const parseResult = createPetSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error, "others.invalidInput"),
        event
      );
    }

    const validated = parseResult.data;
    const User = mongoose.model("User");
    const Pet = mongoose.model("Pet");

    const user = await User.findOne({
      _id: event.userId,
      deleted: { $ne: true },
    })
      .select("_id role deleted")
      .lean();

    if (!user) {
      return createErrorResponse(404, "userNotFound", event);
    }

    if (validated.ngoId || validated.ngoPetId) {
      if (event.userRole !== "ngo") {
        return createErrorResponse(403, "others.unauthorized", event);
      }

      if (!event.ngoId) {
        return createErrorResponse(403, "others.unauthorized", event);
      }

      if (validated.ngoId && String(validated.ngoId) !== String(event.ngoId)) {
        return createErrorResponse(403, "others.unauthorized", event);
      }
    }

    if (validated.ngoPetId) {
      const existingNgoPet = await Pet.findOne({
        ngoPetId: validated.ngoPetId,
        deleted: { $ne: true },
      })
        .select("_id")
        .lean();

      if (existingNgoPet) {
        return createErrorResponse(409, "duplicatePetNgoId", event);
      }
    }

    if (validated.tagId) {
      const existingTag = await Pet.findOne({
        tagId: validated.tagId,
        deleted: { $ne: true },
      })
        .select("_id")
        .lean();

      if (existingTag) {
        return createErrorResponse(409, "duplicatePetTagId", event);
      }
    }

    const pet = await Pet.create({
      userId: user._id,
      name: validated.name,
      birthday: parseDDMMYYYY(validated.birthday),
      weight: validated.weight,
      sex: validated.sex,
      sterilization: validated.sterilization,
      animal: validated.animal,
      breed: validated.breed,
      features: validated.features,
      info: validated.info,
      status: validated.status,
      owner: validated.owner,
      ngoId: event.userRole === "ngo" && event.ngoId ? (validated.ngoId || event.ngoId) : undefined,
      ngoPetId: validated.ngoPetId,
      breedimage: validated.breedimage || [],
      ownerContact1: validated.ownerContact1,
      ownerContact2: validated.ownerContact2,
      contact1Show: validated.contact1Show,
      contact2Show: validated.contact2Show,
      tagId: validated.tagId,
      receivedDate: validated.receivedDate ? parseDDMMYYYY(validated.receivedDate) : null,
      transferNGO: [{
        regDate: null,
        regPlace: null,
        transferOwner: null,
        UserContact: null,
        UserEmail: null,
        transferContact: null,
        transferRemark: null,
        isTransferred: false,
      }],
    });

    const translations = loadTranslations(event.locale || "zh");

    return createSuccessResponse(201, event, {
      message: getTranslation(translations, "success"),
      id: pet._id,
      result: sanitizePet(pet),
    });
  } catch (error) {
    logError("Failed to create pet basic info", {
      scope,
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = { createPetBasicInfo };