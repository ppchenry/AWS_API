const mongoose = require("mongoose");
const { issueUserAccessToken, createRefreshToken } = require("../utils/token");
const bcrypt = require("bcrypt");
const { isValidEmail, isValidPhoneNumber } = require("../utils/validators");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { registerSchema } = require("../zodSchema/registerSchema");

/**
 * UNIFIED REGISTER
 * Handles: Email Registration, Phone Registration, and mixed.
 */
async function register({ event, translations, body }) {
  try {
    const User = mongoose.model("User");

    // 1. Zod Validation
    // Validates that at least (email + password) OR (phone + password) exists
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, parseResult.error.errors[0].message, translations, event);
    }

    const { 
      firstName, 
      lastName, 
      phoneNumber, 
      email, 
      password, 
      role, 
      subscribe,
      promotion,
      district,
      image,
      birthday,
      gender
    } = parseResult.data;

    // 2. Optimized Duplicate Check (One DB Trip)
    // We check if either the email OR phone is already taken by an active account
    const existingUser = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : [])
      ],
      deleted: false
    }).lean();

    if (existingUser) {
      const isPhoneConflict = phoneNumber && existingUser.phoneNumber === phoneNumber;
      const errorKey = isPhoneConflict ? 'phoneRegister.userExist' : 'phoneRegister.existWithEmail';
      return createErrorResponse(409, errorKey, translations, event);
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
      phoneNumber,
      email: email || `${newId.toString()}@temp.account`,
      role: role || "user",
      verified: !!phoneNumber,
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
      success: true,
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
      "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${process.env.REFRESH_TOKEN_MAX_AGE_SEC}`
    });

  } catch (err) {
    console.error("Unified Register Error:", err);
    return createErrorResponse(500, 'others.internalError', translations, event);
  }
}

async function registerNgo({ event, translations, body }) {
  try {
    // Use parsed body directly
    const UserRead = mongoose.model("User");
    const NgoCounters = mongoose.model("NgoCounters");
    const Ngo = mongoose.model("NGO");
    const NgoUserAccess = mongoose.model("NgoUserAccess");

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
      confirmPassword,
      ngoPrefix,
      subscribe
    } = body;

    // Check if all required fields are provided
    if (!firstName || !lastName || !email || !password || !phoneNumber || !ngoName || !businessRegistrationNumber || !ngoPrefix || !address || !confirmPassword) {
      return createErrorResponse(
        400,
        'phoneRegister.paramsMissing',
        translations,
        event
      );
    }

    if (ngoPrefix.length > 5) {
      return createErrorResponse(
        400,
        'Prefix has too much character. maximum number of characters is 5',
        translations,
        event
      );
    }

    if (confirmPassword !== password) {
      return createErrorResponse(
        400,
        'Password does not match confirmation password, please try again.',
        translations,
        event
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return createErrorResponse(
        400,
        'emailRegister.invalidEmailFormat',
        translations,
        event
      );
    }

    // Validate phone number format
    if (!isValidPhoneNumber(phoneNumber)) {
      return createErrorResponse(
        400,
        'emailRegister.invalidPhoneFormat',
        translations,
        event
      );
    }

    // Handle subscribe field
    let formSubscribe = false;
    if (subscribe) {
      formSubscribe = subscribe === 'true';
    }

    // Check if user already exists by email (using read connection)
    const existingUser = await UserRead.find({ email });
    if (existingUser.length > 0) {
      return createErrorResponse(
        400,
        'phoneRegister.userExist',
        translations,
        event
      );
    }

    // Check if phone number already exists (using read connection)
    const existingUserWithPhone = await UserRead.find({ phoneNumber });
    if (existingUserWithPhone.length > 0) {
      return createErrorResponse(
        409,
        'emailRegister.existWithPhone',
        translations,
        event
      );
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const existingNgo = await Ngo.find({ registrationNumber: businessRegistrationNumber });
    if (existingNgo.length > 0) {
      return createErrorResponse(
        400,
        'Duplicate business registration number, please try again with a different number.',
        translations,
        event
      );
    }

    // Create new user in primary database
    const newUser = await UserRead.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phoneNumber,
      role: "ngo",
      verified: true,
      subscribe: subscribe,
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
    });

    const currentDate = new Date();
    const newNgo = await Ngo.create({
      name: ngoName,
      description,
      email,
      phone: phoneNumber,
      website,
      address,
      registrationNumber: businessRegistrationNumber,
      establishedDate: currentDate,
      categories: [],
      role: "ngo"
    });

    const newNgoUserAccess = await NgoUserAccess.create({
      ngoId: newNgo._id,
      userId: newUser._id,
      roleInNgo: "admin",
      assignedPetIds: [],
      menuConfig: {},
      isActive: true
    });

    const newNgoCounters = await NgoCounters.create({
      ngoId: newNgo._id,
      counterType: "ngopet",
      ngoPrefix: ngoPrefix.toUpperCase()
    });

    return createSuccessResponse(201, event, {
      success: true,
      userId: newUser._id,
      ngoId: newNgo._id,
      ngoUserAccessId: newNgoUserAccess._id,
      newNgoCounters: newNgoCounters._id
    });
  } catch (err) {
    return createErrorResponse(500, 'Internal Server Error', translations, event);
  }
}

module.exports = { register, registerNgo };