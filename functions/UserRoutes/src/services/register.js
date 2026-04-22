const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logInfo, logError } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");
const { normalizeEmail, normalizePhone } = require("../utils/validators");
const { issueUserAccessToken, issueNgoAccessToken, createRefreshToken, buildRefreshCookie } = require("../utils/token");
const { registerSchema } = require("../zodSchema/registerSchema");
const { registerNgoSchema } = require("../zodSchema/registerNgoSchema");

/** Max age (ms) for a verification record to be considered valid for registration. */
const VERIFICATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Checks that EVERY supplied identifier was independently verified recently.
 * Returns { verified: true } only when all present identifiers have proof.
 * Returns { verified: false, missing: "email"|"phoneNumber" } on first failure.
 */
async function checkAllIdentifiersVerified({ email, phoneNumber }) {
  const cutoff = new Date(Date.now() - VERIFICATION_WINDOW_MS);

  if (email) {
    const EmailVerificationCode = mongoose.model("EmailVerificationCode");
    const record = await EmailVerificationCode.findOne({
      _id: email,
      consumedAt: { $gte: cutoff },
    }).lean();
    if (!record) return { verified: false, missing: "email" };
  }

  if (phoneNumber) {
    const SmsVerificationCode = mongoose.model("SmsVerificationCode");
    const record = await SmsVerificationCode.findOne({
      _id: phoneNumber,
      consumedAt: { $gte: cutoff },
    }).lean();
    if (!record) return { verified: false, missing: "phoneNumber" };
  }

  return { verified: true };
}

/**
 * Invalidates verification proof records after successful registration.
 * Prevents replay of the same proof for additional registration attempts.
 */
async function consumeVerificationProofs({ email, phoneNumber }) {
  if (email) {
    const EmailVerificationCode = mongoose.model("EmailVerificationCode");
    await EmailVerificationCode.deleteOne({ _id: email }).catch(() => {});
  }
  if (phoneNumber) {
    const SmsVerificationCode = mongoose.model("SmsVerificationCode");
    await SmsVerificationCode.deleteOne({ _id: phoneNumber }).catch(() => {});
  }
}

/**
 * UNIFIED REGISTER (verification-first flow)
 *
 * Frontend flow: verify email/SMS → collect username → POST /account/register
 * This endpoint checks that the identifier was recently verified, then
 * creates the user account and issues tokens.
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
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // 1. Zod Validation
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const {
      firstName,
      lastName,
      phoneNumber,
      email,
      subscribe,
      promotion,
      district,
      image,
      birthday,
      gender
    } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhoneNumber = normalizePhone(phoneNumber);

    // 2. Verify that EVERY supplied identifier was independently verified
    const identifierCheck = await checkAllIdentifiersVerified({
      email: normalizedEmail,
      phoneNumber: normalizedPhoneNumber,
    });
    if (!identifierCheck.verified) {
      const errorKey = identifierCheck.missing === "phoneNumber"
        ? "register.errors.phoneVerificationRequired"
        : "register.errors.verificationRequired";
      return createErrorResponse(403, errorKey, event);
    }

    // 3. Duplicate Check
    const duplicateFilters = [
      ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ...(normalizedPhoneNumber ? [{ phoneNumber: normalizedPhoneNumber }] : []),
    ];

    if (duplicateFilters.length > 0) {
      const existingUser = await User.findOne({
        $or: duplicateFilters,
        deleted: false
      }).lean();

      if (existingUser) {
        const isPhoneConflict = normalizedPhoneNumber && existingUser.phoneNumber === normalizedPhoneNumber;
        const errorKey = isPhoneConflict ? 'userRoutes.errors.phoneRegister.userExist' : 'userRoutes.errors.phoneRegister.existWithEmail';
        return createErrorResponse(409, errorKey, event);
      }
    }

    // 4. Create User — already verified, no password needed
    const newUser = await User.create({
      firstName,
      lastName,
      phoneNumber: normalizedPhoneNumber || undefined,
      email: normalizedEmail || undefined,
      role: "user",
      verified: true,
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

    const user = newUser.toObject();

    // 5. Issue tokens
    const token = issueUserAccessToken(user);
    const { token: refreshToken } = await createRefreshToken(user._id);

    // 5b. Consume verification proofs so they cannot be replayed
    await consumeVerificationProofs({
      email: normalizedEmail,
      phoneNumber: normalizedPhoneNumber,
    });

    logInfo("User registered successfully", {
      scope: "services.register.register",
      event,
      extra: { email: normalizedEmail, phoneNumber: normalizedPhoneNumber, userId: user._id },
    });

    // 6. Success response with tokens
    return createSuccessResponse(201, event, {
      message: "Registration successful",
      userId: user._id,
      role: user.role,
      isVerified: true,
      token,
    }, {
      "Set-Cookie": buildRefreshCookie(refreshToken, event),
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
    return createErrorResponse(500, 'common.internalError', event);
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
      return createErrorResponse(429, "common.rateLimited", event);
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
      return createErrorResponse(409, 'userRoutes.errors.phoneRegister.userExist', event);
    }

    const existingUserWithPhone = await UserRead.findOne({ phoneNumber: normalizedPhoneNumber, deleted: false }).lean();
    if (existingUserWithPhone) {
      return createErrorResponse(409, 'userRoutes.errors.emailRegister.existWithPhone', event);
    }

    const existingNgo = await Ngo.findOne({ registrationNumber: businessRegistrationNumber }).lean();
    if (existingNgo) {
      return createErrorResponse(409, 'userRoutes.errors.registerNgo.duplicateBusinessReg', event);
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
        role: "ngo",
        isVerified: true,
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

      const token = issueNgoAccessToken(newUser, newNgo);
      const { token: refreshToken } = await createRefreshToken(newUser._id);

      return createSuccessResponse(201, event, {
        message: "NGO registration successful",
        userId: newUser._id,
        role: newUser.role,
        isVerified: true,
        token,
        ngoId: newNgo._id,
        ngoUserAccessId: newNgoUserAccess._id,
        newNgoCounters: newNgoCounters._id
      }, {
        "Set-Cookie": buildRefreshCookie(refreshToken, event),
        "Access-Control-Allow-Credentials": "true",
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
    return createErrorResponse(500, 'common.internalError', event);
  }
}

module.exports = { register, registerNgo };
