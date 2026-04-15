const mongoose = require("mongoose");
const { parse } = require("lambda-multipart-parser");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { sanitizePetLost } = require("../utils/sanitize");
const { parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");
const { createPetLostSchema } = require("../zodSchema/petLostSchema");
const { addImageFileToStorage, getNextSerialNumber } = require("./imageUpload");
const { enforceRateLimit } = require("../utils/rateLimit");

/**
 * GET /pets/pet-lost — List all lost pets.
 */
async function listPetLost({ event }) {
  try {
    const PetLost = mongoose.model("PetLost");
    const pets = await PetLost.find({})
      .select("-__v")
      .sort({ lostDate: -1 })
      .lean();

    if (!pets || pets.length === 0) {
      return createSuccessResponse(200, event, {
        message: "No lost pets found",
        count: 0,
        pets: [],
      });
    }

    return createSuccessResponse(200, event, {
      message: "All lost pets retrieved successfully",
      count: pets.length,
      pets: pets.map(sanitizePetLost),
    });
  } catch (error) {
    logError("Error listing lost pets", {
      scope: "services.petLost.listPetLost",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * POST /pets/pet-lost — Create a lost pet record.
 */
async function createPetLost({ event }) {
  try {
    // Rate limit: 5 uploads per 60s per user
    const rl = await enforceRateLimit({
      event,
      action: "create-pet-lost",
      identifier: event.userId,
      limit: 5,
      windowSec: 60,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    const form = await parse(event);

    // Validate form fields with Zod
    const parseResult = createPetLostSchema.safeParse({
      petId: form.petId,
      name: form.name,
      birthday: form.birthday,
      weight: form.weight,
      sex: form.sex,
      sterilization: form.sterilization,
      animal: form.animal,
      breed: form.breed,
      description: form.description,
      remarks: form.remarks,
      status: form.status,
      owner: form.owner,
      ownerContact1: form.ownerContact1,
      lostDate: form.lostDate,
      lostLocation: form.lostLocation,
      lostDistrict: form.lostDistrict,
    });

    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const data = parseResult.data;

    // Update pet status if petId provided
    if (data.petId) {
      const Pet = mongoose.model("Pets");
      const pet = await Pet.findOne({ _id: data.petId }).select("userId").lean();
      if (!pet) {
        return createErrorResponse(404, "petLost.errors.petNotFound", event);
      }
      if (String(pet.userId) !== String(event.userId)) {
        return createErrorResponse(403, "others.selfAccessDenied", event);
      }
      await Pet.updateOne(
        { _id: data.petId },
        { $set: { status: data.status } }
      );
    }

    const PetLost = mongoose.model("PetLost");
    const pet = await PetLost.create({
      userId: event.userId,
      petId: data.petId,
      name: data.name,
      birthday: data.birthday ? parseDDMMYYYY(data.birthday) : null,
      weight: data.weight,
      sex: data.sex,
      sterilization: data.sterilization,
      animal: data.animal,
      breed: data.breed,
      description: data.description,
      remarks: data.remarks,
      status: data.status,
      owner: data.owner,
      ownerContact1: data.ownerContact1,
      lostDate: parseDDMMYYYY(data.lostDate),
      lostLocation: data.lostLocation,
      lostDistrict: data.lostDistrict,
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
        : form.breedimage
          ? form.breedimage.split(",")
          : [];
    }

    // Generate serial number
    pet.serial_number = await getNextSerialNumber();
    await pet.save();

    return createSuccessResponse(201, event, {
      message: "Successfully added pet",
      id: pet._id,
    });
  } catch (error) {
    logError("Error creating lost pet", {
      scope: "services.petLost.createPetLost",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * DELETE /pets/pet-lost/{petLostID} — Delete a lost pet record.
 */
async function deletePetLost({ event }) {
  try {
    const petLostID = event.pathParameters?.petLostID;

    if (!petLostID) {
      return createErrorResponse(400, "petLost.errors.idRequired", event);
    }

    const PetLost = mongoose.model("PetLost");
    const record = await PetLost.findById(petLostID).select("userId").lean();

    if (!record) {
      return createErrorResponse(404, "petLost.errors.notFound", event);
    }

    if (String(record.userId) !== String(event.userId)) {
      return createErrorResponse(403, "others.selfAccessDenied", event);
    }

    await PetLost.deleteOne({ _id: petLostID });

    return createSuccessResponse(200, event, {
      message: "Pet lost record deleted successfully",
    });
  } catch (error) {
    logError("Error deleting lost pet", {
      scope: "services.petLost.deletePetLost",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  listPetLost,
  createPetLost,
  deletePetLost,
};
