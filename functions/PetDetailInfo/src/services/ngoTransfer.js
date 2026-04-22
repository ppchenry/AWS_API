const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { normalizeEmail, normalizePhone, isValidEmail, isValidPhoneNumber, isValidDateFormat, parseDateFlexible } = require("../utils/validators");
const { ngoTransferSchema } = require("../zodSchema/ngoTransferSchema");

async function ngoTransfer({ event, body }) {
  const scope = "services.ngoTransfer.ngoTransfer";
  try {
    const petID = event.pathParameters.petID;
    const Pet = mongoose.model("Pet");
    const User = mongoose.model("User");

    // NGO RBAC already enforced by guard.js

    // Zod validation
    const parseResult = ngoTransferSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }
    const data = parseResult.data;

    // Validate email format
    const normalizedEmail = normalizeEmail(data.UserEmail);
    if (!isValidEmail(normalizedEmail)) {
      return createErrorResponse(400, "petDetailInfo.errors.ngoTransfer.invalidEmailFormat", event);
    }

    // Validate phone format
    const normalizedPhone = normalizePhone(data.UserContact);
    if (!isValidPhoneNumber(normalizedPhone)) {
      return createErrorResponse(400, "petDetailInfo.errors.ngoTransfer.invalidPhoneFormat", event);
    }

    // Validate date format if provided
    if (data.regDate && !isValidDateFormat(data.regDate)) {
      return createErrorResponse(400, "petDetailInfo.errors.ngoTransfer.invalidDateFormat", event);
    }

    // Verify user exists by email and phone (parallel)
    const [userByEmail, userByPhone] = await Promise.all([
      User.findOne({ email: normalizedEmail, deleted: false }).select("_id").lean(),
      User.findOne({ phoneNumber: normalizedPhone, deleted: false }).select("_id").lean(),
    ]);

    // Return a single generic error for missing user to prevent enumeration
    if (!userByEmail || !userByPhone) {
      return createErrorResponse(404, "petDetailInfo.errors.ngoTransfer.targetUserNotFound", event);
    }

    // Cross-validate: email and phone must belong to the same user
    if (String(userByEmail._id) !== String(userByPhone._id)) {
      return createErrorResponse(400, "petDetailInfo.errors.ngoTransfer.userIdentityMismatch", event);
    }

    // Build update fields
    const updateFields = {};
    if (data.regDate) updateFields["transferNGO.0.regDate"] = parseDateFlexible(data.regDate);
    if (data.regPlace) updateFields["transferNGO.0.regPlace"] = data.regPlace;
    if (data.transferOwner) updateFields["transferNGO.0.transferOwner"] = data.transferOwner;
    if (data.transferContact) updateFields["transferNGO.0.transferContact"] = data.transferContact;
    if (data.UserContact) updateFields["transferNGO.0.UserContact"] = data.UserContact;
    if (data.UserEmail !== undefined) updateFields["transferNGO.0.UserEmail"] = data.UserEmail;
    if (data.transferRemark !== undefined) updateFields["transferNGO.0.transferRemark"] = data.transferRemark;
    if (data.isTransferred !== undefined) updateFields["transferNGO.0.isTransferred"] = data.isTransferred;

    // Transfer ownership — only set transfer.0.* fields when present
    updateFields["userId"] = userByEmail._id;
    updateFields["ngoId"] = "";
    if (data.regDate) updateFields["transfer.0.regDate"] = parseDateFlexible(data.regDate);
    if (data.regPlace) updateFields["transfer.0.regPlace"] = data.regPlace;
    if (data.transferOwner) updateFields["transfer.0.transferOwner"] = data.transferOwner;
    if (data.transferContact) updateFields["transfer.0.transferContact"] = data.transferContact;
    if (data.transferRemark !== undefined) updateFields["transfer.0.transferRemark"] = data.transferRemark;

    const result = await Pet.updateOne({ _id: petID, deleted: false }, { $set: updateFields });
    if (result.matchedCount === 0) {
      return createErrorResponse(404, "petDetailInfo.errors.petNotFound", event);
    }

    return createSuccessResponse(200, event, {
      form: data,
      petId: petID,
    });
  } catch (error) {
    logError("Failed to process NGO transfer", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { ngoTransfer };
