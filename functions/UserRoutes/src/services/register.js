const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { connectToMongoDB, getReadConnection } = require("../config/db");
const { generateRefreshToken, hashToken } = require("../utils/token");
const { isValidEmail, isValidPhoneNumber } = require("../utils/validators");
const { createErrorResponse } = require("../utils/response");
const { loadTranslations, getTranslation } = require("../helpers/i18n");
const { corsHeaders } = require("../cors");
const { tryParseJsonBody } = require("../utils/parseBody");

function requireJsonBodyOrError(event) {
  const parsed = tryParseJsonBody(event);
  if (!parsed.ok) {
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);
    return { error: createErrorResponse(400, "others.invalidJSON", t, event) };
  }
  return { body: parsed.body };
}

async function isPhoneRegister(event, context) {
  const json = requireJsonBodyOrError(event);
  if (json.error) return json.error;

  const readConn = await getReadConnection();
   // Use read connection for checking existing users
   const UserRead = readConn.model("User");
   const RefreshTokenRead = readConn.model("RefreshToken");

   const body = json.body;

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
   // Create new user in primary database
   const newUser = new UserRead({
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

   let token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

   const newRefreshToken = generateRefreshToken();
   const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
     
   // Create new refresh token record in primary database
   const newRefreshTokenRecord = new RefreshTokenRead({
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

async function isEmailRegister(event, context) {
  console.log("IS EMAIL REGISTER");

  const readConn = await getReadConnection();
      const UserRead = readConn.model("User");

      // Use parsed body
      let body = event.body ? JSON.parse(event.body) : {};

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
        { expiresIn: "1h" }
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

async function isRegister(event, context) {
  const json = requireJsonBodyOrError(event);
  if (json.error) return json.error;

  const readConn = await getReadConnection();
  // Use read connection for checking existing users
  const UserRead = readConn.model("User");

  const body = json.body;

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

async function isEmailRegisterV2(event, context) {
  const json = requireJsonBodyOrError(event);
  if (json.error) return json.error;

  const readConn = await getReadConnection();
  // Use read connection for checking existing users
  const UserRead = readConn.model("User");
  const RefreshTokenRead = readConn.model("RefreshToken");
  const body = json.body;

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
  
  // Create/update user in primary database
  const newUser = await UserRead.findOneAndUpdate(
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
    { expiresIn: "1h" }
  );


  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

  // Create new refresh token record in primary database
  const newRefreshTokenRecord = new RefreshTokenRead({
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

async function isRegisterNgo(event, context) {
  const json = requireJsonBodyOrError(event);
  if (json.error) return json.error;

  const readConn = await getReadConnection();
   // Use read connection for checking existing users
   const UserRead = readConn.model("User");
   const NgoCounters = readConn.model("NgoCounters");
   const Ngo = readConn.model("NGO");
   const NgoUserAccess = readConn.model("NgoUserAccess");

   const body = json.body;

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

module.exports = { isPhoneRegister, isEmailRegister, isRegister, isEmailRegisterV2, isRegisterNgo };