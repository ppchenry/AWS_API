const mongoose = require("mongoose");
const { issueUserAccessToken, createRefreshToken, buildRefreshCookie } = require("../utils/token");
const bcrypt = require("bcrypt");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");
const { normalizeEmail, normalizePhone } = require("../utils/validators");
const { registerSchema } = require("../zodSchema/registerSchema");
const { registerNgoSchema } = require("../zodSchema/registerNgoSchema");

/**
 * UNIFIED REGISTER
 * Handles: Email Registration, Phone Registration, and mixed.
 */
async function register({ event, body }) {
  try {
    const User = mongoose.model("User");

    const rateLimit = await enforceRateLimit({
      event,
      action: "register",
      limit: 12,
      windowSec: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    // 1. Zod Validation
    // Validates that at least (email + password) OR (phone + password) exists
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const { 
      firstName, 
      lastName, 
      phoneNumber, 
      email, 
      password, 
      subscribe,
      promotion,
      district,
      image,
      birthday,
      gender
    } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhoneNumber = normalizePhone(phoneNumber);

    // 2. Optimized Duplicate Check (One DB Trip)
    // We check if either the email OR phone is already taken by an active account
    const existingUser = await User.findOne({
      $or: [
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(normalizedPhoneNumber ? [{ phoneNumber: normalizedPhoneNumber }] : [])
      ],
      deleted: false
    }).lean();

    if (existingUser) {
      const isPhoneConflict = normalizedPhoneNumber && existingUser.phoneNumber === normalizedPhoneNumber;
      const errorKey = isPhoneConflict ? 'phoneRegister.userExist' : 'phoneRegister.existWithEmail';
      return createErrorResponse(409, errorKey, event);
    }

    // 3. Security: Hash Password
    // Use 10 salt rounds (Standard for performance/security balance)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Create User Instance
    const newId = new mongoose.Types.ObjectId();
    
    const newUser = new User({
      _id: newId,
      firstName,
      lastName,
      password: hashedPassword,
      phoneNumber: normalizedPhoneNumber,
      email: normalizedEmail || `${newId.toString()}@temp.account`,
      role: "user",
      verified: !!normalizedPhoneNumber,
      subscribe: subscribe === 'true' || subscribe === true,
      promotion: promotion ?? false,
      district: district ?? null,
      image: image ?? null,
      birthday: birthday ?? null,
      gender: gender ?? "",
      deleted: false,
      credit: 300,
      vetCredit: 300,
      eyeAnalysisCredit: 300,
      bloodAnalysisCredit: 300,
    });

    // 5. Save to Database
    await newUser.save();

    // 6. Generate Authentication Tokens
    const token = issueUserAccessToken(newUser);
    const { token: newRefreshToken } = await createRefreshToken(newUser._id);

    // 7. Final Success Response with Refresh Token Cookie
    return createSuccessResponse(201, event, {
      id: newUser._id,
      token: token,
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
        role: newUser.role,
        verified: newUser.verified,
      }
    }, {
      "Set-Cookie": buildRefreshCookie(newRefreshToken, event)
    });

  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return createErrorResponse(409, `register.duplicate.${field}`, event);
    }
    logError("Unified register failed", {
      scope: "services.register.register",
      event,
      error: err,
      extra: {
        email: body?.email,
        phoneNumber: body?.phoneNumber,
      },
    });
    return createErrorResponse(500, 'others.internalError', event);
  }
}

/**
 * Registers an NGO along with its admin user in a single MongoDB transaction.
 * Creates User, NGO, NgoUserAccess, and NgoCounters atomically.
 * @param {RouteContext} routeContext
 */
async function registerNgo({ event, body }) {
  try {
    const UserRead = mongoose.model("User");
    const NgoCounters = mongoose.model("NgoCounters");
    const Ngo = mongoose.model("NGO");
    const NgoUserAccess = mongoose.model("NgoUserAccess");

    const rateLimit = await enforceRateLimit({
      event,
      action: "register-ngo",
      limit: 8,
      windowSec: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return createErrorResponse(429, "others.rateLimited", event);
    }

    // 1. Zod Validation (replaces manual field checks)
    const parseResult = registerNgoSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const {
      firstName,
      lastName,
      phoneNumber,
      email,
      password,
      ngoName,
      description,
      website,
      address,
      businessRegistrationNumber,
      ngoPrefix,
      subscribe
    } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhoneNumber = normalizePhone(phoneNumber);

    // 2. Duplicate checks (findOne + lean for performance)
    const existingUser = await UserRead.findOne({ email: normalizedEmail, deleted: false }).lean();
    if (existingUser) {
      return createErrorResponse(409, 'phoneRegister.userExist', event);
    }

    const existingUserWithPhone = await UserRead.findOne({ phoneNumber: normalizedPhoneNumber, deleted: false }).lean();
    if (existingUserWithPhone) {
      return createErrorResponse(409, 'emailRegister.existWithPhone', event);
    }

    const existingNgo = await Ngo.findOne({ registrationNumber: businessRegistrationNumber }).lean();
    if (existingNgo) {
      return createErrorResponse(409, 'registerNgo.duplicateBusinessReg', event);
    }

    // 3. Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Atomic creation via MongoDB transaction
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const [newUser] = await UserRead.create([{
        firstName,
        lastName,
        email: normalizedEmail,
        password: hashedPassword,
        phoneNumber: normalizedPhoneNumber,
        role: "ngo",
        verified: true,
        subscribe: subscribe === 'true' || subscribe === true,
        promotion: false,
        district: null,
        image: null,
        birthday: null,
        deleted: false,
        credit: 300,
        vetCredit: 300,
        eyeAnalysisCredit: 300,
        bloodAnalysisCredit: 300,
        gender: ""
      }], { session });

      const [newNgo] = await Ngo.create([{
        name: ngoName,
        description,
        email: normalizedEmail,
        phone: normalizedPhoneNumber,
        website,
        address,
        registrationNumber: businessRegistrationNumber,
        establishedDate: new Date(),
        categories: [],
        role: "ngo"
      }], { session });

      const [newNgoUserAccess] = await NgoUserAccess.create([{
        ngoId: newNgo._id,
        userId: newUser._id,
        roleInNgo: "admin",
        assignedPetIds: [],
        menuConfig: {},
        isActive: true
      }], { session });

      const [newNgoCounters] = await NgoCounters.create([{
        ngoId: newNgo._id,
        counterType: "ngopet",
        ngoPrefix: ngoPrefix.toUpperCase()
      }], { session });

      await session.commitTransaction();

      return createSuccessResponse(201, event, {
        userId: newUser._id,
        ngoId: newNgo._id,
        ngoUserAccessId: newNgoUserAccess._id,
        newNgoCounters: newNgoCounters._id
      });
    } catch (createErr) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw createErr;
    } finally {
      session.endSession();
    }
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return createErrorResponse(409, `register.duplicate.${field}`, event);
    }
    logError("NGO registration failed", {
      scope: "services.register.registerNgo",
      event,
      error: err,
      extra: {
        email: body?.email,
        phoneNumber: body?.phoneNumber,
        ngoName: body?.ngoName,
      },
    });
    return createErrorResponse(500, 'others.internalError', event);
  }
}

module.exports = { register, registerNgo };
