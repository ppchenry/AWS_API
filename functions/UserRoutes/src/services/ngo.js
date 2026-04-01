const mongoose = require("mongoose");
const { getReadConnection } = require("../config/db");
const { checkDuplicates } = require("../helpers/duplicateCheck");
const { flattenToDot, pickAllowed, hasKeys } = require("../helpers/objectUtils");
const { createErrorResponse } = require("../utils/response");
const { loadTranslations } = require("../helpers/i18n");
const { tryParseJsonBody } = require("../utils/parseBody");

async function isGetUserListNgo(event) {
  const readConn = await getReadConnection();
  const User = readConn.model("User");
  const NgoCounters = readConn.model("NgoCounters");
  const Ngo = readConn.model("NGO");
  const NgoUserAccess = readConn.model("NgoUserAccess");
  const qs = event.queryStringParameters || {};

  try {
    const search = (qs.search || "").trim();
    const pageNum = parseInt(qs.page || "1", 10);
    const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
    const limit = 50;
    const skip = (page - 1) * limit;
    const sort = { createdAt: -1 };
    const data = await NgoUserAccess.find({}).sort(sort).skip(skip).limit(limit).lean();

    const userList = [];
    for (let i = 0; i < data.length; i++) {
      const user = await User.findOne({ _id: data[i].userId });
      const ngo = await Ngo.findOne({ _id: data[i].ngoId });
      if (!user || !ngo) continue;
      if (
        search &&
        !(
          (user.firstName && user.firstName.includes(search)) ||
          (user.lastName && user.lastName.includes(search)) ||
          (ngo.registrationNumber && ngo.registrationNumber.includes(search)) ||
          (ngo.name && ngo.name.includes(search))
        )
      ) {
        continue;
      }
      const ngoCounter = await NgoCounters.findOne({ ngoId: ngo._id });
      const sequence = ngoCounter?.seq;
      const ngoSequence = sequence == null ? "" : String(sequence);
      userList.push({
        _id: data[i]?.userId ?? "",
        firstName: user?.firstName ?? "",
        role: user?.role ?? "",
        lastName: user?.lastName ?? "",
        email: user?.email ?? "",
        deleted: user?.deleted,
        ngoName: ngo?.name ?? "",
        ngoId: data[i].ngoId ?? "",
        businessRegistrationNumber: ngo?.registrationNumber ?? "",
        country: ngo?.address?.country ?? "",
        ngoPrefix: ngoCounter?.ngoPrefix ?? "",
        sequence: ngoSequence,
      });
    }
    const totalPages = Math.max(Math.ceil(userList.length / limit), 1);
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({
        userList,
        totalPages,
        totalDocs: userList.length,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Internal Server Error",
        error: err?.message || String(err),
      }),
    };
  }
}

async function isGetPetPlacementOptions(event) {
  const readConn = await getReadConnection();
  const Ngo = readConn.model("NGO");
  const lang = event.cookies?.language || "zh";
  const t = loadTranslations(lang);

  const ngoId_toGet = event.pathParameters?.ngoId;
  if (!ngoId_toGet) {
    return createErrorResponse(400, "Missing NgoId", t, event);
  }
  if (!mongoose.isValidObjectId(ngoId_toGet)) {
    return createErrorResponse(
      400,
      "NgoId is not a valid mongoose object Id",
      t,
      event
    );
  }
  const ngo = await Ngo.findOne({ _id: ngoId_toGet });
  if (!ngo) {
    return createErrorResponse(
      400,
      "There is no ngo account associated with the id.",
      t,
      event
    );
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      petPlacementOptions: ngo.petPlacementOptions,
    }),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };
}

async function isGetNgoDetails(event) {
  const readConn = await getReadConnection();
  const User = readConn.model("User");
  const NgoCounters = readConn.model("NgoCounters");
  const Ngo = readConn.model("NGO");
  const NgoUserAccess = readConn.model("NgoUserAccess");

  const ngoId_toGet = event.pathParameters?.ngoId;
  const ngo = await Ngo.findOne({ _id: ngoId_toGet });
  const results = await Promise.allSettled([
    User.findOne({ email: ngo?.email }).lean(),
    NgoUserAccess.findOne({ ngoId: ngoId_toGet }).lean(),
    NgoCounters.findOne({ ngoId: ngoId_toGet }).lean(),
  ]);
  const pick = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
  const err = (i) =>
    results[i].status === "rejected"
      ? String(results[i].reason?.message || results[i].reason)
      : null;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      userProfile: pick(0),
      ngoProfile: ngo,
      ngoUserAccessProfile: pick(1),
      ngoCounters: pick(2),
      errors: {
        userProfile: err(0),
        ngoProfile: err(1),
        ngoCounters: err(2),
      },
    }),
  };
}

async function isEditNgo(event) {
  const readConn = await getReadConnection();
  const User = readConn.model("User");
  const NgoCounters = readConn.model("NgoCounters");
  const Ngo = readConn.model("NGO");
  const NgoUserAccess = readConn.model("NgoUserAccess");
  const lang = event.cookies?.language || "zh";
  const t = loadTranslations(lang);

  try {
    const USER_ALLOWED = new Set([
      "firstName",
      "lastName",
      "email",
      "phoneNumber",
      "gender",
      "deleted",
    ]);
    const NGO_ALLOWED = new Set([
      "name",
      "description",
      "registrationNumber",
      "email",
      "website",
      "address.street",
      "address.city",
      "address.state",
      "address.zipCode",
      "address.country",
      "petPlacementOptions",
    ]);
    const COUNTERS_ALLOWED = new Set(["ngoPrefix", "seq"]);
    const ACCESS_ALLOWED = new Set([
      "roleInNgo",
      "menuConfig.canViewPetList",
      "menuConfig.canEditPetDetails",
      "menuConfig.canManageAdoptions",
      "menuConfig.canAccessFosterLog",
      "menuConfig.canViewReports",
      "menuConfig.canManageUsers",
      "menuConfig.canManageNgoSettings",
    ]);

    const ngoId = event.pathParameters?.ngoId;
    if (!ngoId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ message: "Missing path parameter: ngoId" }),
      };
    }

    const parsed = tryParseJsonBody(event);
    if (!parsed.ok) {
      return createErrorResponse(400, "others.invalidJSON", t, event);
    }
    const payload = parsed.body;
    const userId = payload.userProfile?.userId;

    const emailLower = (s) => (typeof s === "string" ? s.trim().toLowerCase() : s);

    const dup = await checkDuplicates(
      { User, Ngo },
      [
        {
          model: "User",
          path: "email",
          value: emailLower(payload.userProfile?.email),
          label: "User email",
        },
        {
          model: "User",
          path: "phoneNumber",
          value: payload.userProfile?.phoneNumber,
          label: "User phoneNumber",
        },
        {
          model: "Ngo",
          path: "registrationNumber",
          value: payload.ngoProfile?.registrationNumber?.trim(),
          label: "NGO registrationNumber",
        },
        {
          model: "Ngo",
          path: "email",
          value: emailLower(payload.ngoProfile?.email),
          label: "NGO email",
        },
      ],
      {
        User: userId,
        Ngo: ngoId,
      }
    );

    if (!dup.ok) {
      return createErrorResponse(
        404,
        "Duplicate values on email or phone number or business registration number. please use another phone or email or business registration number",
        null,
        event
      );
    }

    const userDot = pickAllowed(flattenToDot(payload.userProfile || {}), USER_ALLOWED);
    const ngoDot = pickAllowed(flattenToDot(payload.ngoProfile || {}), NGO_ALLOWED);
    const countersDot = pickAllowed(flattenToDot(payload.ngoCounters || {}), COUNTERS_ALLOWED);
    const accessDot = pickAllowed(flattenToDot(payload.ngoUserAccessProfile || {}), ACCESS_ALLOWED);

    const updates = [];

    if (hasKeys(userDot)) {
      if (!userId) {
        return {
          statusCode: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ message: "Missing user identity (userId)" }),
        };
      }
      updates.push(
        User.findOneAndUpdate(
          { _id: userId, role: "ngo" },
          { $set: userDot },
          { new: true, runValidators: true }
        )
          .lean()
          .then((doc) => ({ key: "userProfile", doc }))
      );
    }

    if (hasKeys(ngoDot)) {
      updates.push(
        Ngo.findOneAndUpdate(
          { _id: ngoId },
          { $set: ngoDot },
          { new: true, runValidators: true }
        )
          .lean()
          .then((doc) => ({ key: "ngoProfile", doc }))
      );
    }

    if (hasKeys(countersDot)) {
      updates.push(
        NgoCounters.findOneAndUpdate(
          { ngoId },
          { $set: countersDot },
          { new: true, runValidators: true, upsert: false }
        )
          .lean()
          .then((doc) => ({ key: "ngoCounters", doc }))
      );
    }

    if (hasKeys(accessDot)) {
      updates.push(
        NgoUserAccess.findOneAndUpdate(
          { ngoId, userId },
          { $set: accessDot },
          { new: true, runValidators: true }
        )
          .lean()
          .then((doc) => ({ key: "ngoUserAccessProfile", doc }))
      );
    }

    if (updates.length === 0) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ message: "No valid fields provided to update." }),
      };
    }

    const results = await Promise.all(updates);
    const response = {};
    for (const r of results) response[r.key] = r.doc;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Updated successfully",
        updated: Object.keys(response),
        data: response,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Internal Server Error",
        error: err?.message || String(err),
      }),
    };
  }
}

module.exports = {
  isGetUserListNgo,
  isEditNgo,
  isGetPetPlacementOptions,
  isGetNgoDetails,
};
