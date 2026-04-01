const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { connectToMongoDB, getReadConnection } = require("./src/config/db.js");
const { hashToken, generateRefreshToken, issueAccessToken } = require("./src/utils/token.js");
const { isValidEmail, isValidPhoneNumber, isValidDateFormat, isValidImageUrl } = require("./src/utils/validators.js");
const { loadTranslations, getTranslation } = require("./src/helpers/i18n.js");
const { createErrorResponse } = require("./src/helpers/response.js");
const { checkDuplicates } = require("./src/helpers/duplicateCheck.js");
const { flattenToDot, pickAllowed, hasKeys } = require("./src/helpers/objectUtils.js");
const { corsHeaders, handleOptions } = require('./src/cors.js');

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const client = twilioAccountSid && twilioAuthToken
  ? require("twilio")(twilioAccountSid, twilioAuthToken)
  : null;

exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  console.log("Origin:", event.headers?.origin);
  console.log("Method:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return handleOptions(event);
  }


  try {
    // Get connection for reads
    const readConn = await getReadConnection();
    console.log("EVENT: ", event.resource);
    
    // Parse JSON body with error handling
    let parsedBody;
    try {
      parsedBody = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
      const lang = event.cookies?.language || "zh";
      const t = loadTranslations(lang);
        return createErrorResponse(
          400,
          'others.invalidJSON',
          t,
          event
        );
    }
    
    const isPhoneRegister = event.resource?.includes("/register-by-phoneNumber") || event.path?.includes("/register-by-phoneNumber");
    const isEmailRegister = event.resource?.includes("/register-by-email") || event.path?.includes("/register-by-email");
    const isEmailRegisterV2 = event.resource?.includes("/register-email-2") || event.path?.includes("/register-email-2") || event.resource?.includes("/register-email-app") || event.path?.includes("/register-email-app");

    const isEmailLogin = event.resource?.includes("/login") || event.path?.includes("/login");
    const isLogin = event.resource?.includes("login-2") || event.path?.includes("/login-2");
    const isUpdatePassword = event.resource?.includes("/update-password") || event.path?.includes("/update-password");
    const isRegister = event.resource?.includes("/register") || event.path?.includes("/register");
    const isGenerateSmsCode = event.resource?.includes("/generate-sms-code") || event.path?.includes("/generate-sms-code");
    const isDeleteUserWithEmail = event.resource?.includes("/delete-user-with-email") || event.path?.includes("/delete-user-with-email");
    const isVerifySmsCode = event.resource?.includes("/verify-sms-code") || event.path?.includes("/verify-sms-code");
    const isUpdateUserImage = event.resource?.includes("/update-image") || event.path?.includes("/update-image");
    const isRegisterNgo = event.resource?.includes("/register-ngo") || event.path?.includes("/register-ngo");
    const isGetUserListNgo = event.resource?.includes("/user-list") || event.path?.includes("/user-list");
    const isEditNgo = event.resource?.includes("/edit-ngo") || event.path?.includes("/edit-ngo");
    const isGetPetPlacementOptions = event.resource?.includes("/pet-placement-options") || event.path?.includes("/pet-placement-options");




    if (isPhoneRegister) {
      // Use read connection for checking existing users
      const UserRead = readConn.model("User");
      const RefreshTokenRead = readConn.model("RefreshToken");

      // Use parsed body
      let body = parsedBody;

      const lang =
        event.cookies?.language || body.lang?.toLowerCase() || "zh";
      const t = loadTranslations(lang);

      const {
        firstName,
        lastName,
        phoneNumber,
        email,
        password,
        role,
        subscribe
      } = body;

      // Check if all required fields are provided
      if (!firstName || !lastName || !phoneNumber) {
        return createErrorResponse(
          400,
          'phoneRegister.paramsMissing',
          t,
          event
        );
      }

      // Validate phone number format
      if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
        return createErrorResponse(
          400,
          'phoneRegister.invalidPhoneFormat',
          t,
          event
        );
      }

      // Validate email format if provided
      if (email && !isValidEmail(email)) {
        return createErrorResponse(
          400,
          'phoneRegister.invalidEmailFormat',
          t,
          event
        );
      }

      // Handle subscribe field
      let formSubscribe = false;
      if (subscribe) {
        formSubscribe = subscribe === 'true';
      }

      // Check if user already exists (using read connection)
      let existingUser = await UserRead.find({ phoneNumber });
      if (existingUser.length > 0) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),
          },
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'phoneRegister.userExist'),
          }),
        };
      }

      const newId = new mongoose.Types.ObjectId(); // Instantiate with parentheses
      let emailString;
      if (!email) {
        emailString = `${newId.toString()}@gmail.com`;
      }
      else {
        existingUser = await UserRead.find({ email });
        if (existingUser.length > 0) {
          return {
            statusCode: 409,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
               
            },
            body: JSON.stringify({
              success: false,
              error: getTranslation(t, 'phoneRegister.existWithEmail'),
            }),
          };
        }
        emailString = email;
      }

      // Connect to primary database for writes
      await connectToMongoDB();
      const UserModel = mongoose.model("User");
      const RefreshTokenModel = mongoose.model("RefreshToken");
      
      // Create new user in primary database
      const newUser = new UserModel({
        firstName,
        lastName,
        email: emailString,
        password,
        phoneNumber,
        role,
        verified: true,
        subscribe: formSubscribe,
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

      await newUser.save();

      let token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: "15m" });

      const newRefreshToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
        
      // Create new refresh token record in primary database
      const newRefreshTokenRecord = new RefreshTokenModel({
        userId: newUser._id,
        tokenHash: hashToken(newRefreshToken),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: expiresAt
      });

      await newRefreshTokenRecord.save();


      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(event),
          "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${14 * 24 * 60 * 60}`,
        },
        body: JSON.stringify({
          success: true,
          user: {
            id: newUser._id,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
            phoneNumber: newUser.phoneNumber,
            role: newUser.role,
            verified: newUser.verified,
            subscribe: newUser.subscribe,
            promotion: newUser.promotion,
            district: newUser.district,
            image: newUser.image,
            birthday: newUser.birthday,
          },
          id: newUser._id,
          token: token,
        }),
      };
    }
    else if (isEmailRegister) {
      console.log("IS EMAIL REGISTER");

      // Use read connection for checking existing users
      const UserRead = readConn.model("User");
      const RefreshTokenRead = readConn.model("RefreshToken");

      const stage = event.requestContext?.stage || "";
      let cookiePath = "/auth/refresh"; // Default path
      
      if (stage === "Dev") {
        cookiePath = "/Dev/auth/refresh";
      } else if (stage === "Production") {
        cookiePath = "/Production/auth/refresh";
      }

      // Use parsed body
      let body = parsedBody;

      const lang =
        event.cookies?.language || body.lang?.toLowerCase() || "zh";
      const t = loadTranslations(lang);

      const {
        firstName,
        lastName,
        phoneNumber,
        email,
        password,
        role,
        subscribe
      } = body;

      // Check if all required fields are provided
      if (!firstName || !lastName || !email || !phoneNumber) {
        console.log('error', body);
        return createErrorResponse(
          400,
          'phoneRegister.paramsMissing',
          t,
          event
        );
      }

      // Validate email format
      if (!isValidEmail(email)) {
        return createErrorResponse(
          400,
          'emailRegister.invalidEmailFormat',
          t,
          event
        );
      }

      // Validate phone number format
      if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
        return createErrorResponse(
          400,
          'emailRegister.invalidPhoneFormat',
          t,
          event
        );
      }

      // Handle subscribe field
      let formSubscribe = false;
      if (subscribe) {
        formSubscribe = subscribe === 'true';
      }

      // Check if email already exists (using read connection)
      let existingUserWithEmail = await UserRead.find({email: email});
      if (existingUserWithEmail.length > 0) {
        return {
          statusCode: 409,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),
          },
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'phoneRegister.existWithEmail'),
            code: 'EMAIL_EXISTS'
          }),
        };
      }
      

      if (phoneNumber) {
        let existingUserWithPhone = await UserRead.find({ phoneNumber });
        if (existingUserWithPhone.length > 0) {
          return {
            statusCode: 409,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
               
            },
            body: JSON.stringify({
              success: false,
              error: getTranslation(t, 'emailRegister.existWithPhone'),
              phoneNumber: phoneNumber,
              code: 'PHONE_EXISTS'
            }),
          };
        }
      }

      // Connect to primary database for writes
      await connectToMongoDB();
      const UserModel = mongoose.model("User");
      const RefreshTokenModel = mongoose.model("RefreshToken");
      
      // Create new user in primary database
      const newUser = new UserModel({
        firstName,
        lastName,
        email,
        password,
        phoneNumber,
        role,
        verified: false,
        subscribe: formSubscribe,
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

      await newUser.save();

      const token = jwt.sign(
        {
          userId: newUser._id,
          userRole: newUser.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );


      const newRefreshToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  
      // Create new refresh token record in primary database
      const newRefreshTokenRecord = new RefreshTokenModel({
        userId: newUser._id,
        tokenHash: hashToken(newRefreshToken),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: expiresAt
      });

      await newRefreshTokenRecord.save();


      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(event),
          "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${14 * 24 * 60 * 60}`,
        },
        body: JSON.stringify({
          success: true,
          user: {
            id: newUser._id,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
            phoneNumber: newUser.phoneNumber,
            role: newUser.role,
            verified: newUser.verified,
            subscribe: newUser.subscribe,
            promotion: newUser.promotion,
            district: newUser.district,
            image: newUser.image,
            birthday: newUser.birthday,
          },
          token,
          id: newUser._id,
        }),
      };
    }
    else if (isEmailRegisterV2) {
      // Use read connection for checking existing users
      const UserRead = readConn.model("User");

      // Use parsed body
      let body = parsedBody;

      const lang =
        event.cookies?.language || body.lang?.toLowerCase() || "en";
      const t = loadTranslations(lang);

      const stage = event.requestContext?.stage || "";
      let cookiePath = "/auth/refresh"; // Default path
      
      if (stage === "Dev") {
        cookiePath = "/Dev/auth/refresh";
      } else if (stage === "Production") {
        cookiePath = "/Production/auth/refresh";
      }

      const {
        firstName,
        lastName,
        phoneNumber,
        email,
        role,
        subscribe
      } = body;

      // Check if all required fields are provided
      if (!firstName || !lastName || !email || !phoneNumber) {
        return createErrorResponse(
          400,
          'phoneRegister.paramsMissing',
          t,
          event
        );
      }

      // Validate email format
      if (!isValidEmail(email)) {
        return createErrorResponse(
          400,
          'emailRegister.invalidEmailFormat',
          t,
          event
        );
      }

      // Validate phone number format
      if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
        return createErrorResponse(
          400,
          'emailRegister.invalidPhoneFormat',
          t,
          event
        );
      }

      // Handle subscribe field
      let formSubscribe = false;
      if (subscribe) {
        formSubscribe = subscribe === 'true';
      }

      if (phoneNumber) {
        let existingUser = await UserRead.find({ phoneNumber });
        if (existingUser.length > 0) {
          return {
            statusCode: 409,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
               
            },
            body: JSON.stringify({
              success: false,
              error: getTranslation(t, 'emailRegister.existWithPhone'),
              phoneNumber: phoneNumber,
              code: 'PHONE_EXISTS'
            }),
          };
        }
      }

      // Connect to primary database for writes
      await connectToMongoDB();
      const UserModel = mongoose.model("User");
      const RefreshTokenModel = mongoose.model("RefreshToken");
      
      // Create/update user in primary database
      const newUser = await UserModel.findOneAndUpdate(
        {email: email},
        {
          firstName: firstName,
          lastName: lastName,
          phoneNumber: phoneNumber,
          email: email,
          role: "user",
          subscribe: subscribe,
          gender: "",
          verified: true
        },
        { new: true, upsert: true }
      );

      const token = jwt.sign(
        {
          userId: newUser._id,
          userRole: newUser.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );


      const newRefreshToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  
      // Create new refresh token record in primary database
      const newRefreshTokenRecord = new RefreshTokenModel({
        userId: newUser._id,
        tokenHash: hashToken(newRefreshToken),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: expiresAt
      });

      await newRefreshTokenRecord.save();


      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(event),
          "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${14 * 24 * 60 * 60}`,
        },
        body: JSON.stringify({
          success: true,
          user: {
            id: newUser._id,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
            phoneNumber: newUser.phoneNumber,
            role: newUser.role,
            verified: newUser.verified,
            subscribe: newUser.subscribe,
            promotion: newUser.promotion,
            district: newUser.district,
            image: newUser.image,
            birthday: newUser.birthday,
          },
          token,
          id: newUser._id,
        }),
      };
    }
    else if (isRegisterNgo) {
        // Use read connection for checking existing users
        const UserRead = readConn.model("User");
        const NgoCounters = readConn.model("NgoCounters");
        const Ngo = readConn.model("NGO");
        const NgoUserAccess = readConn.model("NgoUserAccess");

        // Use parsed body
        let body = parsedBody;

        const lang =
          event.cookies?.language || body.lang?.toLowerCase() || "zh";
        const t = loadTranslations(lang);

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

        console.log("BODY: ", body);
        // Check if all required fields are provided
        if (!firstName || !lastName || !email || !password || !phoneNumber || !ngoName || !businessRegistrationNumber || !ngoPrefix || !address || !confirmPassword) {
          return createErrorResponse(
            400,
            'phoneRegister.paramsMissing',
            t,
            event
          );
        }

        if (ngoPrefix.length > 5){
          return createErrorResponse(
            400,
            'Prefix has too much character. maximum number of characters is 5',
            t,
            event
          );
        }

        if (confirmPassword !== password) {
          return createErrorResponse(
            400,
            'Password does not match confirmation password, please try again.',
            t,
            event
          );
        }

        // Validate email format
        if (!isValidEmail(email)) {
          return createErrorResponse(
            400,
            'emailRegister.invalidEmailFormat',
            t,
            event
          );
        }

        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
          return createErrorResponse(
            400,
            'emailRegister.invalidPhoneFormat',
            t,
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
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({
              success: false,
              error: getTranslation(t, 'phoneRegister.userExist'),
              code: 'USER_EXISTS'
            }),
          };
        }

        // Check if phone number already exists (using read connection)
        const existingUserWithPhone = await UserRead.find({ phoneNumber });
        if (existingUserWithPhone.length > 0) {
          return {
            statusCode: 409,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event)
            },
            body: JSON.stringify({
              success: false,
              error: getTranslation(t, 'emailRegister.existWithPhone'),
              phoneNumber: phoneNumber,
              code: 'PHONE_EXISTS'
            }),
          };
        }

        const saltRounds = 10;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const existingNgo = await Ngo.find({registrationNumber: businessRegistrationNumber});
        if (existingNgo.length > 0) {
          return createErrorResponse(
            400,
            'Duplicate business registration number, please try again with a different number.',
            t,
            event
          );
        }

        // Connect to primary database for writes
        await connectToMongoDB();
        const UserModel = mongoose.model("User");
        
        // Create new user in primary database
        const newUser = await UserModel.create({
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

        const currentDate = new Date().now;
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


        
        console.log("NEW USER: ", newUser);
        console.log("NEW NGO: ", newNgo);

        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),

          },
          body: JSON.stringify({
            success: true,
            userId: newUser._id,
            ngoId: newNgo._id,
            ngoUserAccessId: newNgoUserAccess._id,
            newNgoCounters: newNgoCounters._id
          }),
        };
    }
    else if (isRegister) {
      // Use read connection for checking existing users
      const UserRead = readConn.model("User");

      // Use parsed body
      let body = parsedBody;

      const lang =
        event.cookies?.language || body.lang?.toLowerCase() || "zh";
      const t = loadTranslations(lang);

      const {
        firstName,
        lastName,
        phoneNumber,
        email,
        password,
        subscribe,
        role,
      } = body;

      // Check if all required fields are provided
      if (!firstName || !lastName || !email || !password || !phoneNumber) {
        return createErrorResponse(
          400,
          'phoneRegister.paramsMissing',
          t,
          event
        );
      }

      // Validate email format
      if (!isValidEmail(email)) {
        return createErrorResponse(
          400,
          'emailRegister.invalidEmailFormat',
          t,
          event
        );
      }

      // Validate phone number format
      if (!isValidPhoneNumber(phoneNumber)) {
        return createErrorResponse(
          400,
          'emailRegister.invalidPhoneFormat',
          t,
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
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),
          },
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'phoneRegister.userExist'),
            code: 'USER_EXISTS'
          }),
        };
      }

      // Check if phone number already exists (using read connection)
      const existingUserWithPhone = await UserRead.find({ phoneNumber });
      if (existingUserWithPhone.length > 0) {
        return {
          statusCode: 409,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event)
          },
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'emailRegister.existWithPhone'),
            phoneNumber: phoneNumber,
            code: 'PHONE_EXISTS'
          }),
        };
      }

      const saltRounds = 10;

      // Hash password
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Connect to primary database for writes
      await connectToMongoDB();
      const UserModel = mongoose.model("User");
      
      // Create new user in primary database
      const newUser = new UserModel({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phoneNumber,
        role,
        verified: false,
        subscribe: formSubscribe,
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

      await newUser.save();

      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(event),

        },
        body: JSON.stringify({
          success: true,
          user: {
            id: newUser._id,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            email: newUser.email,
            phoneNumber: newUser.phoneNumber,
            role: newUser.role,
            verified: newUser.verified,
            subscribe: newUser.subscribe,
            promotion: newUser.promotion,
            district: newUser.district,
            image: newUser.image,
            birthday: newUser.birthday,
          },
          id: newUser._id,
        }),
      };
    }
    else if (isLogin){
      // Use read connection for user lookup
      const UserRead = readConn.model("User");
      let body = parsedBody;
      const query = {};
      if (body.email) query.email = body.email;
      if (body.phone) query.phoneNumber = body.phone;
      const user = await UserRead.findOne(query);
      console.log("USER: ", user);
      if (!user) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            userId: "new user",
            newUser: true
          }),
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event)
          },
        };
      } else {
        return {
          statusCode: 200,
          body: JSON.stringify({
            userId: user._id,
            newUser: user.newUser
          }),
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event)
          },
        };
      }

    }
    else if (isEmailLogin) {
      // Use read connection for user lookup
      const UserRead = readConn.model("User");
      const NgoUserAccessRead = readConn.model("NgoUserAccess");
      const NGORead = readConn.model("NGO");

      // Use parsed body
      let body = parsedBody;
      console.log("EVENT BODY", JSON.stringify(event.body));

      const lang =
        event.cookies?.language || body.lang?.toLowerCase() || "zh";
      const t = loadTranslations(lang);

      const { email, password } = body;

      // Validate input
      if (!email || !password) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'emailLogin.paramsMissing'),
            code: "MISSING_FIELDS",
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Validate email format
      if (!isValidEmail(email)) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'emailLogin.invalidEmailFormat'),
            code: "INVALID_EMAIL",
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Find user (using read connection)
      const user = await UserRead.findOne({ email });
      console.log("USER", user);

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return {
          statusCode: 401,
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'emailLogin.invalidUserCredential'),
            code: "INVALID_USER",
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Check if account is deleted
      if (user.deleted === true) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, 'login.accountDeleted'),
            code: "ACCOUNT_DELETED",
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      }

      // Check if account is verified (if verification is required)
      // Uncomment if verification is required before login
      // if (!user.verified) {
      //   return {
      //     statusCode: 403,
      //     body: JSON.stringify({
      //       success: false,
      //       error: getTranslation(t, 'login.accountNotVerified'),
      //       code: "NOT_VERIFIED",
      //     }),
      //     headers: {
      //       "Content-Type": "application/json",
      //       "Access-Control-Allow-Origin": "*",
      //     },
      //   };
      // }

      const stage = event.requestContext?.stage || "";
      let cookiePath = "/auth/refresh"; // Default path
      
      if (stage === "Dev") {
        cookiePath = "/Dev/auth/refresh";
      } else if (stage === "Production") {
        cookiePath = "/Production/auth/refresh";
      }

      // Handle NGO role
      if (user.role === "ngo") {
        const ngoUserAccess = await NgoUserAccessRead.findOne({
          userId: user._id,
          isActive: true,
        });
        console.log("NGO USER ACCESS", ngoUserAccess);

        if (!ngoUserAccess) {
          return {
            statusCode: 401,
            body: JSON.stringify({
              success: false,
              error: getTranslation(t, 'emailLogin.userNGONotFound'),
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        const ngo = await NGORead.findOne({ _id: ngoUserAccess.ngoId });
        console.log("NGO", ngo);

        if (!ngo) {
          return {
            statusCode: 401,
            body: JSON.stringify({
              success: false,
              error: getTranslation(t, 'emailLogin.NGONotFound'),
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        const token = jwt.sign(
          {
            userId: user._id,
            userEmail: user.email,
            ngoId: ngo._id,
            ngoName: ngo.name,
          },
          process.env.JWT_SECRET,
          { expiresIn: "15m" }
        );

        const newRefreshToken = generateRefreshToken();
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    
        // Connect to primary database for writes
        await connectToMongoDB();
        const RefreshTokenModel = mongoose.model("RefreshToken");
        
        // Create new refresh token record in primary database
        const newRefreshTokenRecord = new RefreshTokenModel({
          userId: user._id,
          tokenHash: hashToken(newRefreshToken),
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: expiresAt
        });
  
        await newRefreshTokenRecord.save();

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: getTranslation(t, 'emailLogin.success') + ` ${ngo.name}`,
            data: {
              token,
              user,
              ngo,
              ngoUserAccess,
            },
          }),
          headers: {
            "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${14 * 24 * 60 * 60}`,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true"
          },
        };
      }

      // Handle non-NGO role
      const token = jwt.sign(
        {
          userId: user._id,
          userRole: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );


      const newRefreshToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  
      // Connect to primary database for writes
      await connectToMongoDB();
      const RefreshTokenModel = mongoose.model("RefreshToken");
      
      // Create new refresh token record in primary database
      const newRefreshTokenRecord = new RefreshTokenModel({
        userId: user._id,
        tokenHash: hashToken(newRefreshToken),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: expiresAt
      });

      await newRefreshTokenRecord.save();



      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: getTranslation(t, 'emailLogin.success'),
          u_id: user._id,
          role: user.role,
          token,
          isVerified: user.verified,
          email: user.email,
        }),
        headers: {
          "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${14 * 24 * 60 * 60}`,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": "true"
        },
      };
    }
    else if (isUpdatePassword) {
      const User = mongoose.model("User");

      // Use parsed body
      let body = parsedBody;
      
      const lang =
        event.cookies?.language || body.lang?.toLowerCase() || "zh";
      const t = loadTranslations(lang);

      console.log("Parsed body:", body);

      const { userId, oldPassword, newPassword } = body;

      if (!userId || !mongoose.isValidObjectId(userId) || !oldPassword || !newPassword) {
        return createErrorResponse(
          400,
          "phoneRegister.paramsMissing",
          t,
          event
        );
      }

      // Validate user ID format
      if (!mongoose.isValidObjectId(userId)) {
        return createErrorResponse(
          400,
          "updatePassword.invalidUserId",
          t,
          event
        );
      }

      // Basic password strength validation
      if (newPassword.length < 8) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            error: getTranslation(t, "updatePassword.passwordLong"),
            code: "PASSWORD_TOO_SHORT"
          }),
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        };
      }

      // Connect to primary database for reads (password comparison needs primary)
      await connectToMongoDB();
      const UserModel = mongoose.model("User");
      
      const user = await UserModel.findOne({ _id: userId });
      if (!user) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            success: false,
            error:
              getTranslation(t, "updatePassword.userNotFound")

          }),
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        };
      }

      const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
      if (!isPasswordValid) {
        return {
          statusCode: 401,
          body: JSON.stringify({ 
            success: false, 
            error: getTranslation(t, "updatePassword.currentPasswordInvalid"),
            code: "CURRENT_PASSWORD_INVALID"
          }),
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        };
      }

      // Check if new password is same as old password
      if (oldPassword === newPassword) {
        return createErrorResponse(
          400,
          "updatePassword.passwordUnchanged",
          t,
          event
        );
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      user.password = hashedPassword;
      await user.save();

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true, message:
            getTranslation(t, "updatePassword.success")
        }),
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      };
    }
    else if (isGenerateSmsCode) {
      try {
        // Use read connection for checking existing users
        const UserRead = readConn.model("User");
        // Use parsed body
        const body = parsedBody;
        console.log("Body", body)

        const lang =
          event.cookies?.language || body.lang?.toLowerCase() || "zh";

        const t = loadTranslations(lang);
        const phoneNumber = body.phoneNumber;

        if (!client || !twilioVerifyServiceSid) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({
              error: 'SMS verification service is not configured',
              code: 'TWILIO_NOT_CONFIGURED'
            }),
          };
        }

        if (!phoneNumber) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({ 
              error: getTranslation(t, 'verification.missingParams'),
              code: 'MISSING_PARAMS'
            }),
          };
        }

        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({ 
              error: getTranslation(t, 'verification.invalidPhoneFormat'),
              code: 'INVALID_PHONE'
            }),
          };
        }

        // Check if user already exists (using read connection)
        let existingUser = await UserRead.find({ phoneNumber });
        const verification = await client.verify.v2
  .services(twilioVerifyServiceSid)
        .verifications.create({ to: phoneNumber, channel: "sms" });
        console.log('verification.sid', verification.sid);
        
        if (existingUser.length > 0) {

          return {
            statusCode: 201,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({
              newUser: false,
              message: getTranslation(t, 'verification.generateSMSSuccess'),
            }),
          };
        }
        else {
          return {
            statusCode: 201,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({
              newUser: true,
            }),
          };
        }
      } catch (e) {
        console.error('Error:', e);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),
          },
          body: JSON.stringify({ error: e.message }),
        };
      }
    }
    else if (isVerifySmsCode) {
      try {
        // Use parsed body
        const body = parsedBody;

        const lang =
          event.cookies?.language || body.lang?.toLowerCase() || "zh";

        const stage = event.requestContext?.stage || "";
        let cookiePath = "/auth/refresh"; // Default path
        
        if (stage === "Dev") {
          cookiePath = "/Dev/auth/refresh";
        } else if (stage === "Production") {
          cookiePath = "/Production/auth/refresh";
        }

        const t = loadTranslations(lang);
        const phoneNumber = body.phoneNumber;
        const code = body.code;

        if (!client || !twilioVerifyServiceSid) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({
              error: 'SMS verification service is not configured',
              code: 'TWILIO_NOT_CONFIGURED'
            }),
          };
        }

        if (!phoneNumber) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({ 
              error: getTranslation(t, 'verification.missingParams'),
              code: 'MISSING_PARAMS'
            }),
          };
        }

        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({ 
              error: getTranslation(t, 'verification.invalidPhoneFormat'),
              code: 'INVALID_PHONE'
            }),
          };
        }

        if (!code) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({ 
              error: getTranslation(t, 'verification.missingCodeParams'),
              code: 'MISSING_CODE'
            }),
          };
        }

        let status;
        console.log('BEFORE VERIFICATION CHECK');

        const verification_check = await client.verify.v2
          .services(twilioVerifyServiceSid)
          .verificationChecks.create({ to: phoneNumber, code: code })

        console.log('Verification check:', verification_check);
        status = verification_check.status;
        console.log('STATUS:', status);

        // Use read connection for user lookup
        const UserRead = readConn.model("User");
        const RefreshTokenRead = readConn.model("RefreshToken");
        const user = await UserRead.findOne({ phoneNumber: phoneNumber });

        if (status === 'approved') {
          if (!user) {
            return {
              statusCode: 201,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(event),
                },
              body: JSON.stringify({
                message: getTranslation(t, 'registration.successful'),
                u_id: 'new user',
                role: 'user',
                token: '',
              }),
            };
          } else {
            const token = jwt.sign(
              {
                userId: user._id,
                userRole: user.role,
              },
              process.env.JWT_SECRET,
              { expiresIn: "15m" }
            );

            const newRefreshToken = generateRefreshToken();
            const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
        
            // Connect to primary database for writes
            await connectToMongoDB();
            const RefreshTokenModel = mongoose.model("RefreshToken");
            
            // Create new refresh token record in primary database
            const newRefreshTokenRecord = new RefreshTokenModel({
              userId: user._id,
              tokenHash: hashToken(newRefreshToken),
              createdAt: new Date(),
              lastUsedAt: new Date(),
              expiresAt: expiresAt
            });

            await newRefreshTokenRecord.save();

            return {
              statusCode: 201,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(event),
                "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${14 * 24 * 60 * 60}`,
              },
              body: JSON.stringify({
                success: true,
                message: getTranslation(t, 'login.successful'),
                u_id: user._id,
                role: user.role,
                token: token,
              }),
            };
          }
        } else if (status === 'pending') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({ 
              error: getTranslation(t, 'verification.codeIncorrect'),
              code: 'CODE_INCORRECT'
            }),
          };
        } else {
          // Check if code expired (Twilio returns 'canceled' or 'expired' status)
          if (status === 'canceled' || status === 'expired') {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(event),
                },
              body: JSON.stringify({
                error: getTranslation(t, 'verification.codeExpired'),
                code: 'CODE_EXPIRED'
              }),
            };
          }
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(event),
            },
            body: JSON.stringify({
              error: getTranslation(t, 'verification.failed'),
              code: 'VERIFICATION_FAILED'
            }),
          };
        }
      } catch (e) {
        console.error('Error:', e.message);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),
          },
          body: JSON.stringify({ error: e.message }),
        };
      }
    }
    else if (isUpdateUserImage) {
      console.log("IS UPDATE USER IMAGE FUNCTION");
      // Use read connection for checking existing users
      const UserRead = readConn.model("User");
      try {
        // Use parsed body
        const form = parsedBody;
        const lang =
          event.cookies?.language || form.lang?.toLowerCase() || "zh";
        const t = loadTranslations(lang);

        if (!form.userId || !form.image) {
          return createErrorResponse(
            400,
            "others.missingParams",
            t,
            event
          );
        }

        // Validate user ID format
        if (!mongoose.isValidObjectId(form.userId)) {
          return createErrorResponse(
            400,
            "updateImage.invalidUserId",
            t,
            event
          );
        }

        // Validate image URL format
        if (!isValidImageUrl(form.image)) {
          return createErrorResponse(
            400,
            "updateImage.invalidImageUrl",
            t,
            event
          );
        }

        // Check if user exists (using read connection)
        const userExists = await UserRead.findOne({ _id: form.userId });
        if (!userExists) {
          return createErrorResponse(
            404,
            "updateImage.userNotFound",
            t,
            event
          );
        }


        // Connect to primary database for writes
        await connectToMongoDB();
        const UserModel = mongoose.model("User");
        
        const updatedUser = await UserModel.findOneAndUpdate({ _id: form.userId },
          {
            image: form.image
          },
          { new: true }
        );

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message:
              getTranslation(t, "updateImage.success"),
            user: updatedUser,
          }),
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        };
      } catch (e) {
        console.error('Error:', e.message);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(event),
          },
          body: JSON.stringify({
            success: false,
            error: e.message
          }),
        };
      }
    }
    else if (isDeleteUserWithEmail) {
      console.log("IS DELET USER WITH EMAIL CALLED");
      try {
        // Use read connection for checking existing users
        const UserRead = readConn.model("User");
        const lang =
          event.cookies?.language || "zh";
        const t = loadTranslations(lang);
        // Use parsed body
        const form = parsedBody;
        console.log("form: ", form);
        if (!form.email) {
          return createErrorResponse(
            400,
            'deleteAccount.paramsMissing',
            t,
            event
          );
        }

        // Validate email format
        if (!isValidEmail(form.email)) {
          return createErrorResponse(
            400,
            'deleteAccount.invalidEmailFormat',
            t,
            event
          );
        }

        const existingUser = await UserRead.findOne({email: form.email});
        console.log("existingUser: ", existingUser);
        if (!existingUser) {
          return createErrorResponse(
            400,
            'deleteAccount.userNotFound',
            t,
            event
          );
        }

        // Check if user is already deleted
        if (existingUser.deleted === true) {
          return createErrorResponse(
            400,
            'deleteAccount.userAlreadyDeleted',
            t,
            event
          );
        }

        // Connect to primary database for writes
        await connectToMongoDB();
        const UserModel = mongoose.model("User");
        
        await UserModel.updateOne(
          { email: form.email },
          { $set: { deleted: true } }
        );
        console.log("EXISTING USER AFTER DELETING: ", existingUser.deleted);
        //Successfully updated user deleted to true
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: getTranslation(t, 'deleteAccount.success'),
          }),
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        };
      } catch (e) {

      }
      
      

    }
    else if (isGetUserListNgo) {
      const User = readConn.model("User");
      const NgoCounters = readConn.model("NgoCounters");
      const Ngo = readConn.model("NGO");
      const NgoUserAccess = readConn.model("NgoUserAccess");
      const qs = event.queryStringParameters || {};

      try {
        const search = (qs.search || "").trim();          // search term
        const pageNum = parseInt(qs.page || "1");
        const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        
        const sort = { createdAt: -1 };
        const data = await NgoUserAccess.find({}).sort(sort).skip(skip).limit(limit).lean();
        console.log("DATA: ", data.length);

        let userList = [];
        for (let i = 0; i < data.length; i++) {
          console.log(`${i} current index: `, data[i]);
          const user = await User.findOne({_id: data[i].userId});
          console.log(`USER ${i}: `, user);
          const ngo = await Ngo.findOne({_id: data[i].ngoId});
          console.log(`NGO ID ${i}: `, data[i].ngoId);
          console.log(`NGO ${i}: `, ngo);
          if (search && !(user.firstName && user.firstName.includes(search) || user.lastName && user.lastName.includes(search) || ngo.registrationNumber && ngo.registrationNumber.includes(search) || ngo.name && ngo.name.includes(search))) {
            console.log("GOES IN SKIP")
            continue;
          } else {
            console.log("DOES NOT GO IN SKIP")
            const ngoCounter = await NgoCounters.findOne({ngoId: ngo._id});
            console.log(`NGO Counter ${i}: `, ngoCounter);
            const sequence = ngoCounter?.seq;
            const ngoSequence = sequence == null ? "" : String(sequence);
            console.log("ngoSequence: ", ngoSequence);
            const object = {
              _id: data[i]?.userId ?? "",
              firstName: user?.firstName ?? "",
              role: user?.role ?? "",
              lastName: user?.lastName ?? "",
              email: user?.email ?? "",
              deleted: user?.deleted,
              ngoName: ngo?.name ?? "",
              ngoId: data[i].ngoId ?? "",
              businessRegistrationNumber: ngo?.registrationNumber ?? "",
              country: ngo?.address.country ?? "",
              ngoPrefix: ngoCounter?.ngoPrefix ?? "",
              sequence: ngoSequence
            };
            userList.push(object);
          }
         
          
        }
        console.log("USER LIST AFTER FOR LOOP: ", userList);
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
            totalDocs: userList.length
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
    else if (isGetPetPlacementOptions) {
      const Ngo = readConn.model("NGO");
      const ngoId_toGet = event.pathParameters?.ngoId;
      if (!ngoId_toGet) {
        return createErrorResponse(
          400,
          "Missing NgoId",
          "en",
          event
        );
      }

      if (!mongoose.isValidObjectId(ngoId_toGet)) {
        return createErrorResponse(
          400,
          "NgoId is not a valid mongoose object Id",
          "en",
          event
        );
      }

      const ngo = await Ngo.findOne({_id: ngoId_toGet});


      if (!ngo) {
        return createErrorResponse(
          400,
          "There is no ngo account associated with the id.",
          "en",
          event
        );
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          petPlacementOptions: ngo.petPlacementOptions
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    else if (isEditNgo) {
      const User = readConn.model("User");
      const NgoCounters = readConn.model("NgoCounters");
      const Ngo = readConn.model("NGO");
      const NgoUserAccess = readConn.model("NgoUserAccess");
      
      const httpMethod = event.httpMethod;

      switch (httpMethod) {

        case "GET":
          const ngoId_toGet = event.pathParameters?.ngoId;
          const ngo = await Ngo.findOne({_id: ngoId_toGet});
          const results = await Promise.allSettled([
            User.findOne({ email: ngo.email }).lean(),
            NgoUserAccess.findOne({ ngoId: ngoId_toGet }).lean(),
            NgoCounters.findOne({ ngoId: ngoId_toGet }).lean(),
          ]);
        
          const pick = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
          const err  = (i) => (results[i].status === "rejected" ? String(results[i].reason?.message || results[i].reason) : null);
        
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

        case "PUT":
          try {
            const USER_ALLOWED = new Set(["firstName", "lastName", "email", "phoneNumber", "gender", "deleted"]);

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
              "petPlacementOptions"
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

            
        
            // Common patterns:
            // - If using Cognito/JWT authorizer:
          
              
            const payload = event.body ? JSON.parse(event.body) : {};
            const userId = payload.userProfile.userId;

            const emailLower = (s) => (typeof s === "string" ? s.trim().toLowerCase() : s);

            const dup = await checkDuplicates(
              { User, Ngo },
              [
                {
                  model: "User",
                  path: "email",
                  value: emailLower(payload.userProfile?.email),
                  label: "User email",
                  // OR use collation approach below if you don't store normalized fields
                  // collation: { locale: "en", strength: 2 },
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
                User: userId, // exclude current user from duplicate checks
                Ngo: ngoId,   // exclude current NGO from duplicate checks
              }
            );

            if (!dup.ok) {
              return createErrorResponse(
                404,
                "Duplicate values on email or phone number or business registration number. please use another phone or email or business registration number",
                "en",
                event
              );
            };

            
        
            // Build per-section updates (only from fields present in payload)
            const userDot = pickAllowed(flattenToDot(payload.userProfile || {}), USER_ALLOWED);
            console.log("USERDOT: ", userDot);
            const ngoDot = pickAllowed(flattenToDot(payload.ngoProfile || {}), NGO_ALLOWED);
            console.log("NGODOT: ", ngoDot);
            const countersDot = pickAllowed(flattenToDot(payload.ngoCounters || {}), COUNTERS_ALLOWED);
            console.log("CountersDot: ", countersDot);
            const accessDot = pickAllowed(flattenToDot(payload.ngoUserAccessProfile || {}), ACCESS_ALLOWED);
            console.log("accessDOt: ", accessDot);
        
            // Run only the updates that have actual keys
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
                  { _id: userId, role: "ngo" }, // <- adjust your filter
                  { $set: userDot },
                  { new: true, runValidators: true }
                ).lean().then(doc => ({ key: "userProfile", doc }))
              );
            }

            console.log("Update User");
        
            if (hasKeys(ngoDot)) {
              updates.push(
                Ngo.findOneAndUpdate(
                  { _id: ngoId },
                  { $set: ngoDot },
                  { new: true, runValidators: true }
                ).lean().then(doc => ({ key: "ngoProfile", doc }))
              );
            }

            console.log("Update Ngo");

        
            if (hasKeys(countersDot)) {
              updates.push(
                NgoCounters.findOneAndUpdate(
                  { ngoId }, // <- adjust: maybe { ngoId: ObjectId(ngoId) } depending on schema
                  { $set: countersDot },
                  { new: true, runValidators: true, upsert: false }
                ).lean().then(doc => ({ key: "ngoCounters", doc }))
              );
            }

            console.log("Update NgoCounters");

        
            if (hasKeys(accessDot)) {
              updates.push(
                NgoUserAccess.findOneAndUpdate(
                  { ngoId, userId }, // <- adjust to your schema
                  { $set: accessDot },
                  { new: true, runValidators: true }
                ).lean().then(doc => ({ key: "ngoUserAccessProfile", doc }))
              );
            }

            console.log("Update UserAccess");

        
            // If nothing to update:
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
        
            // Choose behavior:
            // - Promise.all: fail if any update fails
            const results = await Promise.all(updates);
            console.log("results: ", results);
        
            // Shape response
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
                "Content-Type": "application/json" ,
                "Access-Control-Allow-Origin": "*",
              },
              body: JSON.stringify({
                message: "Internal Server Error",
                error: err?.message || String(err),
              }),
            };
          }
        default:
          return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
      }
    }
    else {
      console.log("ACCOUNT GETTING CALLED");
      // Use read connection for GET operations
      const UserRead = readConn.model("User");
      const httpMethod = event.httpMethod;
      const lang =
        event.cookies?.language || "zh";
      const t = loadTranslations(lang);
      switch (httpMethod) {
        case "GET":
          const userId_toGet = event.pathParameters?.userId;

          if (!userId_toGet) {
            return createErrorResponse(
              400,
              "others.missingUserId",
              t,
              event
            );
          }

          if (!mongoose.isValidObjectId(userId_toGet)) {
            return createErrorResponse(
              400,
              "others.invalidGET",
              t,
              event
            );
          }
          const userData = await UserRead.findOne({ _id: userId_toGet });

          if (!userData) {
            return createErrorResponse(
              404,
              'others.getUserNotFound',
              t,
              event
            );
          }

          // Check if user is deleted
          if (userData.deleted === true) {
            return createErrorResponse(
              410,
              'others.userDeleted',
              t,
              event
            );
          }
          return {
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              message: getTranslation(t, "others.getSuccess"),
              user: userData
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "PUT":
          // Use read connection for checking existing users
          const UserReadPut = readConn.model("User");
          // Use parsed body
          const body = parsedBody;
          const { userId, firstName, lastName, birthday, email, district, image, phoneNumber } = body;

          if (!userId) {
            return createErrorResponse(
              400,
              "others.missingUserId",
              t,
              event
            );
          }

          if (!mongoose.isValidObjectId(userId)) {
            return createErrorResponse(
              400,
              'others.invalidPUT',
              t,
              event
            );
          }

          // Validate email format if provided
          if (email && !isValidEmail(email)) {
            return createErrorResponse(
              400,
              'others.invalidEmailFormat',
              t,
              event
            );
          }

          // Validate phone number format if provided
          if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
            return createErrorResponse(
              400,
              'others.invalidPhoneFormat',
              t,
              event
            );
          }

          // Validate date format if provided
          if (birthday && !isValidDateFormat(birthday)) {
            return createErrorResponse(
              400,
              'others.invalidDateFormat',
              t,
              event
            );
          }

          // Check if email already exists (if email is being updated) - using read connection
          if (email) {
            const existingUserWithEmail = await UserReadPut.findOne({ 
              email: email,
              _id: { $ne: userId }
            });
            if (existingUserWithEmail) {
              return {
                statusCode: 409,
                body: JSON.stringify({ 
                  success: false, 
                  error: getTranslation(t, "others.emailExists"),
                  code: "EMAIL_EXISTS"
                }),
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              };
            }
          }

          // Check if phone number already exists (if phone is being updated) - using read connection
          if (phoneNumber) {
            const existingUserWithPhone = await UserReadPut.findOne({ 
              phoneNumber: phoneNumber,
              _id: { $ne: userId }
            });
            if (existingUserWithPhone) {
              return {
                statusCode: 409,
                body: JSON.stringify({ 
                  success: false, 
                  error: getTranslation(t, "others.phoneExists"),
                  code: "PHONE_EXISTS"
                }),
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              };
            }
          }

          // Connect to primary database for writes
          await connectToMongoDB();
          const UserModelPut = mongoose.model("User");
          
          const updatedUser = await UserModelPut.findOneAndUpdate(
            { _id: userId, deleted: false },
            { firstName, lastName, birthday: birthday ? new Date(birthday) : null, email, district, image, phoneNumber },
            { new: true }
          );

          if (!updatedUser) {
            // Check if user exists but is deleted (using read connection)
            const deletedUser = await UserReadPut.findOne({ _id: userId, deleted: true });
            if (deletedUser) {
              return createErrorResponse(
                410,
                "others.userDeleted",
                t,
                event
              );
            }
            return createErrorResponse(
              404,
              "others.putUserNotFound",
              t,
              event
            );
          }

          console.log("UPDATED USER:", updatedUser);

          return {
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              message: getTranslation(t, "others.putUserSuccess"),
              user: updatedUser,
            }),
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          };
        case "DELETE":
          const userId_to_delete = event.pathParameters?.userId;

          if (!userId_to_delete) {
            return createErrorResponse(
              400,
              "others.missingUserId",
              t,
              event
            );
          }

          if (!mongoose.isValidObjectId(userId_to_delete)) {
            return createErrorResponse(
              400,
              "others.invalidDELETE",
              t,
              event
            );
          }

          // Check if user exists (using read connection)
          const userToDelete = await UserRead.findOne({ _id: userId_to_delete });
          if (!userToDelete) {
            return createErrorResponse(
              404,
              "others.userNotFound",
              t,
              event
            );
          }

          // Check if already deleted (if using soft delete)
          // Uncomment if using soft delete instead of hard delete
          // if (userToDelete.deleted === true) {
          //   return createErrorResponse(
          //     410,
          //     "others.userAlreadyDeleted",
          //     "ALREADY_DELETED",
          //     null,
          //     t
          //   );
          // }

          // Connect to primary database for writes
          await connectToMongoDB();
          const UserModelDelete = mongoose.model("User");
          
          await UserModelDelete.deleteOne({ _id: userId_to_delete });

          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "others.deleteUserSuccess"),
              UserId: userId_to_delete,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        default:
          return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
      }

    }

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: "Failed",
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};