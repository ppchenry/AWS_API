const mongoose = require("mongoose");
const { parse } = require("lambda-multipart-parser");
const { addImageFileToStorage } = require("../utils/s3Upload");
const {
  createErrorResponse,
  createSuccessResponse,
} = require("../utils/response");
const { logError } = require("../utils/logger");
const { parseDDMMYYYY } = require("../utils/validators");
const { enforceRateLimit } = require("../utils/rateLimit");
const { loadAuthorizedPet } = require("../middleware/selfAccess");
const {
  createPetWithImageSchema,
  updatePetImageSchema,
} = require("../zodSchema/petImageSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");

/**
 * POST /pets/create-pet-basic-info-with-image
 *
 * Ownership: pet is created under the JWT caller's identity (event.userId),
 * NOT a client-supplied userId field. This closes C3/H10.
 *
 * NGO flow: only callers with role "ngo" may trigger NGO counter + ngoId.
 * This closes the caller-influenced upsert escalation.
 */
async function createPetBasicInfoWithImage({ event }) {
  const scope = "services.petImage.createPetBasicInfoWithImage";
  try {
    // Rate limit: 20 pet creations per 5 minutes per caller
    const rl = await enforceRateLimit({
      event,
      action: "createPetWithImage",
      identifier: event.userId,
      limit: 20,
      windowSec: 300,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    const User = mongoose.model("User");
    const Pet = mongoose.model("Pets");
    const NgoCounter = mongoose.model("NgoCounters");

    const form = await parse(event);

    // Schema validation — rejects unknown fields and enforces type/length bounds
    const { files, ...scalarFields } = form;
    const parseResult = createPetWithImageSchema.safeParse(scalarFields);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error),
        event
      );
    }
    const validated = parseResult.data;

    // Ownership: use JWT identity, ignore any client-supplied userId
    const callerUserId = event.userId;

    // Verify the caller's own user record exists and is active
    const user = await User.findOne({
      _id: callerUserId,
      deleted: { $ne: true },
    }).lean();

    if (!user) {
      return createErrorResponse(404, "eyeUpload.errors.userNotFound", event);
    }

    // NGO pet ID generation — restricted to ngo role with verified ngoId claim
    let ngoPetId = "";
    if (validated.ngoId) {
      if (event.userRole !== "ngo") {
        return createErrorResponse(403, "eyeUpload.errors.ngoRoleRequired", event);
      }
      // JWT must carry an ngoId claim — reject if missing or mismatched
      if (!event.ngoId) {
        return createErrorResponse(403, "eyeUpload.errors.ngoIdClaimRequired", event);
      }
      if (String(event.ngoId) !== String(validated.ngoId)) {
        return createErrorResponse(403, "eyeUpload.errors.forbidden", event);
      }

      const counter = await NgoCounter.findOneAndUpdate(
        { ngoId: validated.ngoId },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      const suffix = String(counter.seq).padStart(5, "0");
      ngoPetId = counter.ngoPrefix + suffix;
    }

    // Duplicate ngoPetId check
    if (ngoPetId) {
      const existing = await Pet.findOne({ ngoPetId }).lean();
      if (existing) {
        return createErrorResponse(409, "eyeUpload.errors.duplicateNgoPetId", event);
      }
    }

    // Process images
    let imageUrls = [];
    if (files && Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        if (file?.content) {
          const multerFile = {
            buffer: file.content,
            originalname: file.filename || "upload.jpg",
          };
          const tempId = new mongoose.Types.ObjectId();
          const url = await addImageFileToStorage(
            multerFile,
            `user-uploads/pets/${tempId}`
          );
          if (url) imageUrls.push(url);
        }
      }
    } else if (validated.breedimage) {
      imageUrls.push(validated.breedimage);
    }

    const pet = await Pet.create({
      userId: user._id,
      name: validated.name,
      birthday: validated.birthday ? parseDDMMYYYY(validated.birthday) : null,
      weight: validated.weight,
      sex: validated.sex,
      sterilization: validated.sterilization,
      sterilizationDate: validated.sterilizationDate
        ? parseDDMMYYYY(validated.sterilizationDate)
        : null,
      adoptionStatus: validated.adoptionStatus,
      animal: validated.animal,
      breed: validated.breed,
      bloodType: validated.bloodType,
      features: validated.features,
      info: validated.info,
      status: validated.status,
      owner: validated.owner,
      ngoId: event.userRole === "ngo" && event.ngoId ? validated.ngoId : undefined,
      ngoPetId,
      ownerContact1: validated.ownerContact1,
      ownerContact2: validated.ownerContact2,
      contact1Show: validated.contact1Show,
      contact2Show: validated.contact2Show,
      receivedDate: validated.receivedDate
        ? parseDDMMYYYY(validated.receivedDate)
        : null,
      breedimage: imageUrls,
      locationName: validated.location,
      position: validated.position,
    });

    return createSuccessResponse(201, event, {
      message: "Successfully added pet",
      id: pet._id,
    });
  } catch (error) {
    logError("Create pet basic info with image failed", {
      scope,
      event,
      error,
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * POST /pets/updatePetImage
 *
 * Ownership: the pet's userId must match the JWT caller's identity.
 * NGO users may update pets belonging to their ngoId.
 * This closes the horizontal privilege escalation.
 */
async function updatePetImage({ event }) {
  const scope = "services.petImage.updatePetImage";
  try {
    // Rate limit: 30 updates per 5 minutes per caller
    const rl = await enforceRateLimit({
      event,
      action: "updatePetImage",
      identifier: event.userId,
      limit: 30,
      windowSec: 300,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    const form = await parse(event);

    // Schema validation — rejects unknown fields, enforces bounds
    const { files, ...scalarFields } = form;
    const parseResult = updatePetImageSchema.safeParse(scalarFields);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error),
        event
      );
    }
    const validated = parseResult.data;
    const petId = validated.petId;

    if (!petId) {
      return createErrorResponse(400, "eyeUpload.errors.petIdRequired", event);
    }

    if (!mongoose.isValidObjectId(petId)) {
      return createErrorResponse(400, "eyeUpload.errors.invalidObjectId", event);
    }

    // DB-backed ownership check via selfAccess helper
    const authResult = await loadAuthorizedPet({ event, petId, options: { lean: false } });
    if (!authResult.isValid) return authResult.error;
    const pet = authResult.pet;

    const isNgoOwner =
      event.userRole === "ngo" &&
      pet.ngoId &&
      event.ngoId &&
      String(pet.ngoId) === String(event.ngoId);

    // Validate removedIndices — return 400 instead of silently ignoring
    if (validated.removedIndices) {
      let removedIndices;
      try {
        removedIndices = JSON.parse(validated.removedIndices);
      } catch {
        return createErrorResponse(
          400,
          "eyeUpload.errors.invalidRemovedIndices",
          event
        );
      }
      if (
        !Array.isArray(removedIndices) ||
        !removedIndices.every((i) => typeof i === "number" && Number.isInteger(i))
      ) {
        return createErrorResponse(
          400,
          "eyeUpload.errors.invalidRemovedIndices",
          event
        );
      }
      if (removedIndices.length > 0) {
        const sortedIndices = removedIndices.sort((a, b) => b - a);
        for (const index of sortedIndices) {
          if (index >= 0 && index < pet.breedimage.length) {
            pet.breedimage.splice(index, 1);
          }
        }
      }
    }

    // Add new images
    if (files && Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        if (file?.content) {
          const multerFile = {
            buffer: file.content,
            originalname: file.filename || "upload.jpg",
          };
          const url = await addImageFileToStorage(
            multerFile,
            `user-uploads/pets/${pet._id}`
          );
          if (url) pet.breedimage.push(url);
        }
      }
    }

    // Update scalar fields — ngoId and isRegistered excluded from
    // client-mutable fields to prevent privilege escalation
    if (validated.name !== undefined) pet.name = validated.name;
    if (validated.animal !== undefined) pet.animal = validated.animal;
    if (validated.birthday !== undefined)
      pet.birthday = parseDDMMYYYY(validated.birthday);
    if (validated.weight !== undefined) pet.weight = validated.weight;
    if (validated.sex !== undefined) pet.sex = validated.sex;
    if (validated.sterilization !== undefined)
      pet.sterilization = validated.sterilization;
    if (validated.sterilizationDate !== undefined)
      pet.sterilizationDate = parseDDMMYYYY(validated.sterilizationDate);
    if (validated.adoptionStatus !== undefined)
      pet.adoptionStatus = validated.adoptionStatus;
    if (validated.breed !== undefined) pet.breed = validated.breed;
    if (validated.bloodType !== undefined) pet.bloodType = validated.bloodType;
    if (validated.features !== undefined) pet.features = validated.features;
    if (validated.info !== undefined) pet.info = validated.info;
    if (validated.status !== undefined) pet.status = validated.status;
    if (validated.owner !== undefined) pet.owner = validated.owner;
    if (validated.tagId !== undefined) pet.tagId = validated.tagId;
    if (validated.ownerContact1 !== undefined)
      pet.ownerContact1 = validated.ownerContact1;
    if (validated.ownerContact2 !== undefined)
      pet.ownerContact2 = validated.ownerContact2;
    if (validated.contact1Show !== undefined) pet.contact1Show = validated.contact1Show;
    if (validated.contact2Show !== undefined) pet.contact2Show = validated.contact2Show;
    if (validated.receivedDate !== undefined)
      pet.receivedDate = parseDDMMYYYY(validated.receivedDate);

    // ngoId mutation: caller must be NGO owner AND destination org must match JWT ngoId
    if (validated.ngoId !== undefined) {
      if (!isNgoOwner) {
        return createErrorResponse(403, "eyeUpload.errors.forbidden", event);
      }
      // Destination org must match JWT claim — prevents cross-org reassignment
      if (String(event.ngoId) !== String(validated.ngoId)) {
        return createErrorResponse(403, "eyeUpload.errors.forbidden", event);
      }
      pet.ngoId = validated.ngoId;
    }

    // Duplicate ngoPetId check — only NGO callers may change ngoPetId
    if (validated.ngoPetId !== undefined && validated.ngoPetId !== pet.ngoPetId) {
      if (!isNgoOwner) {
        return createErrorResponse(403, "eyeUpload.errors.forbidden", event);
      }
      const duplicate = await Pet.findOne({ ngoPetId: validated.ngoPetId }).lean();
      if (duplicate) {
        return createErrorResponse(409, "eyeUpload.errors.duplicateNgoPetId", event);
      }
      pet.ngoPetId = validated.ngoPetId;
    }

    await pet.save({ validateBeforeSave: true });

    return createSuccessResponse(200, event, {
      message: "Pet basic info updated successfully",
      id: pet._id,
    });
  } catch (error) {
    logError("Update pet image failed", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { createPetBasicInfoWithImage, updatePetImage };
