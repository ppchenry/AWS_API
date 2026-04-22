const mongoose = require("mongoose");
const { flattenToDot, pickAllowed, hasKeys } = require("../utils/objectUtils");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { sanitizeUser } = require("../utils/sanitize");
const { editNgoBodySchema } = require("../zodSchema/editNgoSchema");
const { buildNgoUserListPipeline } = require("./ngoUserListPipeline");

/**
 * Lists NGO users with search and pagination via aggregation pipeline.
 * @param {RouteContext} routeContext
 */
async function getNgoUserList({ event }) {
  const NgoUserAccess = mongoose.model("NgoUserAccess");
  const qs = event.queryStringParameters || {};

  try {
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRaw = (qs.search || "").trim();
    const search = escapeRegex(searchRaw);
    const page = Math.max(parseInt(qs.page || "1", 10), 1);
    const limit = 50;
    const skip = (page - 1) * limit;
    const pipeline = buildNgoUserListPipeline({ search, skip, limit });

    const [results = { metadata: [], data: [] }] = await NgoUserAccess.aggregate(pipeline)
      .allowDiskUse(true)
      .exec();
    const totalDocs = results.metadata[0]?.total || 0;
    const totalPages = Math.ceil(totalDocs / limit) || 1;

    const userList = results.data.map((item) => ({
      _id: item.userId,
      firstName: item.user?.firstName ?? "",
      lastName: item.user?.lastName ?? "",
      email: item.user?.email ?? "",
      role: item.user?.role ?? "",
      ngoName: item.ngo?.name ?? "",
      ngoId: item.ngoId,
      ngoPrefix: item.ngoCounter?.ngoPrefix ?? "",
      sequence: item.ngoCounter?.seq?.toString() ?? "",
    }));

    return createSuccessResponse(200, event, { userList, totalPages, totalDocs });
  } catch (err) {
    logError("Failed to list NGO users", {
      scope: "services.ngo.getNgoUserList",
      event,
      error: err,
      extra: {
        search: qs.search,
        page: qs.page,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Retrieves pet placement options for a specific NGO.
 * @param {RouteContext} routeContext
 */
async function getNgoPetPlacementOptions({ event }) {
  try {
    const Ngo = mongoose.model("NGO");

    const ngoId = event.pathParameters?.ngoId;
    if (!ngoId) {
      return createErrorResponse(400, "userRoutes.errors.ngo.missingId", event);
    }

    if (!mongoose.isValidObjectId(ngoId)) {
      return createErrorResponse(400, "userRoutes.errors.ngo.invalidId", event);
    }

    const ngo = await Ngo.findOne({ _id: ngoId }).lean();
    if (!ngo) {
      return createErrorResponse(404, "userRoutes.errors.ngo.notFound", event);
    }

    return createSuccessResponse(200, event, {
      petPlacementOptions: ngo.petPlacementOptions || [],
    });
  } catch (err) {
    logError("Failed to get NGO pet placement options", {
      scope: "services.ngo.getNgoPetPlacementOptions",
      event,
      error: err,
      extra: {
        ngoId: event.pathParameters?.ngoId,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Fetches complete NGO profile with associated user, access, and counter data.
 * @param {RouteContext} routeContext
 */
async function getNgoDetails({ event }) {
  try {
    const User = mongoose.model("User");
    const NgoCounters = mongoose.model("NgoCounters");
    const Ngo = mongoose.model("NGO");
    const NgoUserAccess = mongoose.model("NgoUserAccess");

    const ngoId = event.pathParameters?.ngoId;
    if (!mongoose.isValidObjectId(ngoId)) {
      return createErrorResponse(400, "userRoutes.errors.ngo.invalidId", event);
    }

    const ngo = await Ngo.findOne({ _id: ngoId }).lean();
    if (!ngo) {
      return createErrorResponse(404, "userRoutes.errors.ngo.notFound", event);
    }

    // Parallel fetch for associated data
    const results = await Promise.allSettled([
      User.findOne({ email: ngo?.email, deleted: false }).lean(),
      NgoUserAccess.findOne({ ngoId: ngoId }).lean(),
      NgoCounters.findOne({ ngoId: ngoId }).lean(),
    ]);

    const pick = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
    const errStatus = (i) => (results[i].status === "rejected" ? String(results[i].reason?.message || results[i].reason) : null);

    return createSuccessResponse(200, event, {
      userProfile: sanitizeUser(pick(0)),
      ngoProfile: ngo,
      ngoUserAccessProfile: pick(1),
      ngoCounters: pick(2),
      errors: {
        userProfile: errStatus(0),
        ngoUserAccessProfile: errStatus(1),
        ngoCounters: errStatus(2),
      },
    });
  } catch (err) {
    logError("Failed to get NGO details", {
      scope: "services.ngo.getNgoDetails",
      event,
      error: err,
      extra: {
        ngoId: event.pathParameters?.ngoId,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  }
}

/**
 * Atomically updates NGO-related records (user, NGO, counters, access)
 * within a MongoDB transaction. Validates with Zod and checks for duplicates.
 * @param {RouteContext} routeContext
 */
async function editNgo({ event, body }) {
  // Validate input using Zod
  const parseResult = editNgoBodySchema.safeParse(body);
  if (!parseResult.success) {
    return createErrorResponse(400, "userRoutes.errors.ngo.invalidBody", event);
  }
  // Use the parsed data
  body = parseResult.data;

  // Start a session for the transaction to ensure atomic updates
  const session = await mongoose.startSession();

  const User = mongoose.model("User");
  const NgoCounters = mongoose.model("NgoCounters");
  const Ngo = mongoose.model("NGO");
  const NgoUserAccess = mongoose.model("NgoUserAccess");

  try {
    // 1. Setup Constants & Allowed Fields
    const USER_ALLOWED = new Set(["firstName", "lastName", "email", "phoneNumber", "gender"]);
    const NGO_ALLOWED = new Set([
      "name", "description", "registrationNumber", "email", "website",
      "address.street", "address.city", "address.state", "address.zipCode", "address.country",
      "petPlacementOptions",
    ]);
    const COUNTERS_ALLOWED = new Set(["ngoPrefix", "seq"]);
    const ACCESS_ALLOWED = new Set([
      "roleInNgo", "menuConfig.canViewPetList", "menuConfig.canEditPetDetails",
      "menuConfig.canManageAdoptions", "menuConfig.canAccessFosterLog",
      "menuConfig.canViewReports", "menuConfig.canManageUsers", "menuConfig.canManageNgoSettings",
    ]);

    const ngoId = event.pathParameters?.ngoId;
    const userId = String(event.userId);

    if (!ngoId) {
      return createErrorResponse(400, "userRoutes.errors.ngo.missingId", event);
    }

    // 2. Prepare Updates using dot notation
    const userDot = pickAllowed(flattenToDot(body.userProfile || {}), USER_ALLOWED);
    const ngoDot = pickAllowed(flattenToDot(body.ngoProfile || {}), NGO_ALLOWED);
    const countersDot = pickAllowed(flattenToDot(body.ngoCounters || {}), COUNTERS_ALLOWED);
    const accessDot = pickAllowed(flattenToDot(body.ngoUserAccessProfile || {}), ACCESS_ALLOWED);

    // --- Manual duplicate checking for email, phone, registrationNumber ---
    // Only check if the field is being updated
    if (userDot.email) {
      const existingUserWithEmail = await User.findOne({
        email: userDot.email,
        _id: { $ne: userId },
        deleted: false,
      });
      if (existingUserWithEmail) {
        return createErrorResponse(409, "userRoutes.errors.emailExists", event);
      }
    }
    if (userDot.phoneNumber) {
      const existingUserWithPhone = await User.findOne({
        phoneNumber: userDot.phoneNumber,
        _id: { $ne: userId },
        deleted: false,
      });
      if (existingUserWithPhone) {
        return createErrorResponse(409, "userRoutes.errors.phoneExists", event);
      }
    }
    if (ngoDot.registrationNumber) {
      const existingNgoWithReg = await Ngo.findOne({
        registrationNumber: ngoDot.registrationNumber,
        _id: { $ne: ngoId },
      });
      if (existingNgoWithReg) {
        return createErrorResponse(409, "userRoutes.errors.registrationNumberExists", event);
      }
    }

    let hasUpdates = false;
    const responseData = {};

    // 3. Start Transaction
    session.startTransaction();

    if (hasKeys(userDot)) {
      hasUpdates = true;
      responseData.userProfile = await User.findOneAndUpdate(
        { _id: userId, role: "ngo" },
        { $set: userDot },
        { session, new: true, runValidators: true, lean: true }
      );
      responseData.userProfile = sanitizeUser(responseData.userProfile);
    }

    if (hasKeys(ngoDot)) {
      hasUpdates = true;
      responseData.ngoProfile = await Ngo.findOneAndUpdate(
        { _id: ngoId },
        { $set: ngoDot },
        { session, new: true, runValidators: true, lean: true }
      );
    }

    if (hasKeys(countersDot)) {
      hasUpdates = true;
      responseData.ngoCounters = await NgoCounters.findOneAndUpdate(
        { ngoId },
        { $set: countersDot },
        { session, new: true, runValidators: true, lean: true }
      );
    }

    if (hasKeys(accessDot)) {
      hasUpdates = true;
      responseData.ngoUserAccessProfile = await NgoUserAccess.findOneAndUpdate(
        { ngoId, userId },
        { $set: accessDot },
        { session, new: true, runValidators: true, lean: true }
      );
    }

    if (!hasUpdates) {
      await session.abortTransaction();
      return createSuccessResponse(200, event, { message: "No valid fields provided to update." });
    }

    // 5. Commit all changes to DB
    await session.commitTransaction();

    return createSuccessResponse(200, event, {
      message: "Updated successfully",
      updated: Object.keys(responseData),
      data: responseData,
    });

  } catch (err) {
    // 6. Rollback if any single update fails
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    // Mongoose Validation Error
    if (err.name === "ValidationError") {
      return createErrorResponse(400, "userRoutes.errors.ngo.invalidBody", event);
    }

    logError("NGO edit failed", {
      scope: "services.ngo.editNgo",
      event,
      error: err,
      extra: {
        ngoId: event.pathParameters?.ngoId,
        userId,
      },
    });
    return createErrorResponse(500, "common.internalError", event);
  } finally {
    session.endSession();
  }
}

module.exports = {
  getNgoUserList,
  editNgo,
  getNgoPetPlacementOptions,
  getNgoDetails,
};
