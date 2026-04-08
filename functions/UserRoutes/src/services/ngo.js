const mongoose = require("mongoose");
const { flattenToDot, pickAllowed, hasKeys } = require("../utils/objectUtils");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { editNgoBodySchema } = require("../zodSchema/editNgoSchema");

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

    // Build the Pipeline
    let pipeline = [];

    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $lookup: {
          from: "ngos",
          localField: "ngoId",
          foreignField: "_id",
          as: "ngo",
        },
      },
      { $unwind: "$ngo" }
    );

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "user.firstName": { $regex: search, $options: "i" } },
            { "user.lastName": { $regex: search, $options: "i" } },
            { "ngo.name": { $regex: search, $options: "i" } },
            { "ngo.registrationNumber": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "ngocounters",
                localField: "ngoId",
                foreignField: "ngoId",
                as: "ngoCounter",
              },
            },
            { $unwind: { path: "$ngoCounter", preserveNullAndEmptyArrays: true } },
          ],
        },
      }
    );

    const [results] = await NgoUserAccess.aggregate(pipeline).exec();
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
    return createErrorResponse(500, "Internal Server Error", null, event);
  }
}

async function getNgoPetPlacementOptions({ event, translations }) {
  try {
    const Ngo = mongoose.model("NGO");

    const ngoId = event.pathParameters?.ngoId;
    if (!ngoId) {
      return createErrorResponse(400, "Missing NgoId", translations, event);
    }

    if (!mongoose.isValidObjectId(ngoId)) {
      return createErrorResponse(400, "NgoId is not a valid mongoose object Id", translations, event);
    }

    const ngo = await Ngo.findOne({ _id: ngoId }).lean();
    if (!ngo) {
      return createErrorResponse(404, "There is no ngo account associated with the id.", translations, event);
    }

    return createSuccessResponse(200, event, {
      success: true,
      petPlacementOptions: ngo.petPlacementOptions || [],
    });
  } catch (err) {
    console.error("getNgoPetPlacementOptions Error:", err);
    return createErrorResponse(500, "Internal Server Error", translations, event);
  }
}

async function getNgoDetails({ event, translations }) {
  try {
    const User = mongoose.model("User");
    const NgoCounters = mongoose.model("NgoCounters");
    const Ngo = mongoose.model("NGO");
    const NgoUserAccess = mongoose.model("NgoUserAccess");

    const ngoId = event.pathParameters?.ngoId;
    if (!mongoose.isValidObjectId(ngoId)) {
      return createErrorResponse(400, "Invalid NGO ID format", translations, event);
    }

    const ngo = await Ngo.findOne({ _id: ngoId }).lean();
    if (!ngo) {
      return createErrorResponse(404, "NGO not found", translations, event);
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
      userProfile: pick(0),
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
    console.error("getNgoDetails Error:", err);
    return createErrorResponse(500, "Internal Server Error", translations, event);
  }
}

async function editNgo({ event, translations, body }) {
  // Validate input using Zod
  const parseResult = editNgoBodySchema.safeParse(body);
  if (!parseResult.success) {
    const errorMessages = parseResult.error.errors.map(e => e.message).join(", ");
    return createErrorResponse(400, `Invalid request body: ${errorMessages}`, translations, event);
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
    const USER_ALLOWED = new Set(["firstName", "lastName", "email", "phoneNumber", "gender", "deleted"]);
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
    const userId = body.userProfile?.userId;

    if (!ngoId || !userId) {
      return createErrorResponse(400, "Missing ngoId or userId", translations, event);
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
        return createErrorResponse(409, "others.emailExists", translations, event);
      }
    }
    if (userDot.phoneNumber) {
      const existingUserWithPhone = await User.findOne({
        phoneNumber: userDot.phoneNumber,
        _id: { $ne: userId },
        deleted: false,
      });
      if (existingUserWithPhone) {
        return createErrorResponse(409, "others.phoneExists", translations, event);
      }
    }
    if (ngoDot.registrationNumber) {
      const existingNgoWithReg = await Ngo.findOne({
        registrationNumber: ngoDot.registrationNumber,
        _id: { $ne: ngoId },
      });
      if (existingNgoWithReg) {
        return createErrorResponse(409, "others.registrationNumberExists", translations, event);
      }
    }

    const updates = [];
    const responseData = {};

    // 3. Start Transaction
    session.startTransaction();

    if (hasKeys(userDot)) {
      updates.push(
        User.findOneAndUpdate(
          { _id: userId, role: "ngo" },
          { $set: userDot },
          { session, new: true, runValidators: true, lean: true }
        ).then(doc => { responseData.userProfile = doc; })
      );
    }

    if (hasKeys(ngoDot)) {
      updates.push(
        Ngo.findOneAndUpdate(
          { _id: ngoId },
          { $set: ngoDot },
          { session, new: true, runValidators: true, lean: true }
        ).then(doc => { responseData.ngoProfile = doc; })
      );
    }

    if (hasKeys(countersDot)) {
      updates.push(
        NgoCounters.findOneAndUpdate(
          { ngoId },
          { $set: countersDot },
          { session, new: true, runValidators: true, lean: true }
        ).then(doc => { responseData.ngoCounters = doc; })
      );
    }

    if (hasKeys(accessDot)) {
      updates.push(
        NgoUserAccess.findOneAndUpdate(
          { ngoId, userId },
          { $set: accessDot },
          { session, new: true, runValidators: true, lean: true }
        ).then(doc => { responseData.ngoUserAccessProfile = doc; })
      );
    }

    if (updates.length === 0) {
      await session.abortTransaction();
      return createSuccessResponse(200, event, { message: "No valid fields provided to update." });
    }

    // 4. Execute all queries in parallel
    await Promise.all(updates);

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
      return createErrorResponse(400, err.message, translations, event);
    }

    console.error("NGO Edit Error:", err);
    return createErrorResponse(500, "Internal Server Error", translations, event);
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
