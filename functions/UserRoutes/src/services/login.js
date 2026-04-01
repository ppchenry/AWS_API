const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { connectToMongoDB, getReadConnection } = require("../config/db");
const { generateRefreshToken, hashToken } = require("../utils/token");
const { isValidEmail } = require("../utils/validators");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { loadTranslations, getTranslation } = require("../helpers/i18n");
const { corsHeaders } = require("../cors");
const { tryParseJsonBody } = require("../utils/parseBody");

async function emailLogin(event, context) {
  const parsed = tryParseJsonBody(event);
  if (!parsed.ok) {
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: getTranslation(t, "others.invalidJSON"),
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
  const body = parsed.body;

  const readConn = await getReadConnection();
   // Use read connection for user lookup
   const UserRead = readConn.model("User");
   const NgoUserAccessRead = readConn.model("NgoUserAccess");
   const NGORead = readConn.model("NGO");
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
       { expiresIn: "1h" }
     );

     const newRefreshToken = generateRefreshToken();
     const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
     const RefreshTokenModel = readConn.model("RefreshToken");
     
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
     { expiresIn: "1h" }
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

async function login2(event, context) {
  const parsed = tryParseJsonBody(event);
  if (!parsed.ok) {
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: getTranslation(t, "others.invalidJSON"),
      }),
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(event),
      },
    };
  }
  const body = parsed.body;

  const readConn = await getReadConnection();
   // Use read connection for user lookup
   const UserRead = readConn.model("User");
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
module.exports = { emailLogin, login2 };

