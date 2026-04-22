const mongoose = require("mongoose");
const { parse } = require("lambda-multipart-parser");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { sanitizePetFound } = require("../utils/sanitize");
const { parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");
const { createPetFoundSchema } = require("../zodSchema/petFoundSchema");
const { addImageFileToStorage, getNextSerialNumber } = require("./imageUpload");
const { enforceRateLimit } = require("../utils/rateLimit");

/**
 * GET /pets/pet-found — List all found pets.
 */
async function listPetFound({ event }) {
  try {
    const PetFound = mongoose.model("PetFound");
    const pets = await PetFound.find({})
      .select("-__v")
      .sort({ foundDate: -1 })
      .lean();

    if (!pets || pets.length === 0) {
      return createSuccessResponse(200, event, {
        message: "No found pets found",
        count: 0,
        pets: [],
      });
    }

    return createSuccessResponse(200, event, {
      message: "All found pets retrieved successfully",
      count: pets.length,
      pets: pets.map(sanitizePetFound),
    });
  } catch (error) {
    logError("Error listing found pets", {
      scope: "services.petFound.listPetFound",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * POST /pets/pet-found — Create a found pet record.
 */
async function createPetFound({ event }) {
  try {
    // Rate limit: 5 uploads per 60s per user
    const rl = await enforceRateLimit({
      event,
      action: "create-pet-found",
      identifier: event.userId,
      limit: 5,
      windowSec: 60,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    const form = await parse(event);

    // Validate form fields with Zod
    const parseResult = createPetFoundSchema.safeParse({
      animal: form.animal,
      breed: form.breed,
      description: form.description,
      remarks: form.remarks,
      status: form.status,
      owner: form.owner,
      ownerContact1: form.ownerContact1,
      foundDate: form.foundDate,
      foundLocation: form.foundLocation,
      foundDistrict: form.foundDistrict,
    });

    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const data = parseResult.data;

    const PetFound = mongoose.model("PetFound");
    const pet = await PetFound.create({
      userId: event.userId,
      animal: data.animal,
      breed: data.breed,
      description: data.description,
      remarks: data.remarks,
      status: data.status,
      owner: data.owner,
      ownerContact1: data.ownerContact1,
      foundDate: parseDDMMYYYY(data.foundDate),
      foundLocation: data.foundLocation,
      foundDistrict: data.foundDistrict,
      serial_number: "",
    });

    // Handle file uploads
    if (form.files && Array.isArray(form.files) && form.files.length > 0) {
      for (const file of form.files) {
        if (file?.content) {
          const multerFile = {
            buffer: file.content,
            originalname: file.filename || "upload.jpg",
          };
          const url = await addImageFileToStorage(
            multerFile,
            `user-uploads/pets/${pet._id}`
          );
          if (url) {
            pet.breedimage.push(url);
          }
        }
      }
    } else if (form.breedimage) {
      pet.breedimage = Array.isArray(form.breedimage)
        ? form.breedimage
        : form.breedimage;
    }

    // Generate serial number
    pet.serial_number = await getNextSerialNumber();
    await pet.save();

    return createSuccessResponse(201, event, {
      message: "Successfully added pet",
    });
  } catch (error) {
    logError("Error creating found pet", {
      scope: "services.petFound.createPetFound",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * DELETE /pets/pet-found/{petFoundID} — Delete a found pet record.
 */
async function deletePetFound({ event }) {
  try {
    const petFoundID = event.pathParameters?.petFoundID;

    if (!petFoundID) {
      return createErrorResponse(400, "petLostAndFound.errors.petFound.idRequired", event);
    }

    const PetFound = mongoose.model("PetFound");
    const record = await PetFound.findById(petFoundID).select("userId").lean();

    if (!record) {
      return createErrorResponse(404, "petLostAndFound.errors.petFound.notFound", event);
    }

    if (String(record.userId) !== String(event.userId)) {
      return createErrorResponse(403, "common.selfAccessDenied", event);
    }

    await PetFound.deleteOne({ _id: petFoundID });

    return createSuccessResponse(200, event, {
      message: "Pet found record deleted successfully",
    });
  } catch (error) {
    logError("Error deleting found pet", {
      scope: "services.petFound.deletePetFound",
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = {
  listPetFound,
  createPetFound,
  deletePetFound,
};
