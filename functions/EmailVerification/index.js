const UserSchema = require("./models/User.js");
const RefreshTokenSchema = require("./models/RefreshToken.js");
const mongoose = require("mongoose");
const nodemailer = require('nodemailer');
const jwt = require("jsonwebtoken");
const { hashToken, generateRefreshToken } = require("./utils.js");
const { corsHeaders, handleOptions } = require('./cors');



const fs = require("fs");
const path = require("path");

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
    if (conn == null) {
        conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("MongoDB primary connected to database: petpetclub");
        // Register schemas
        mongoose.model("User", UserSchema, "users");
        mongoose.model("RefreshToken", RefreshTokenSchema, "refresh_tokens");
    }
    return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
    return await connectToMongoDB();
};

const loadTranslations = (lang = "zh") => {
    const supportedLangs = ["en", "zh"];
    const fallbackLang = "zh";
    const filePath = path.join(
        __dirname,
        "locales",
        `${supportedLangs.includes(lang) ? lang : fallbackLang}.json`
    );
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
};

const getTranslation = (translations, key) => {
    return (
        key.split(".").reduce((obj, part) => {
            return obj && obj[part] !== undefined ? obj[part] : null;
        }, translations) || key
    );
};

// Validation helper functions
const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
};

const isValidResetCode = (code) => {
    if (!code || typeof code !== 'string') return false;
    // Should be 6 digits (may be padded with zeros)
    const codeRegex = /^\d{6}$/;
    return codeRegex.test(code.trim());
};

// Helper function to create error response
const createErrorResponse = (statusCode, error, translations, event) => {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        ...corsHeaders(event)
    };
    
    const errorMessage = translations ? getTranslation(translations, error) : error;
    
    return {
        statusCode,
        headers: defaultHeaders,
        body: JSON.stringify({
            success: false,
            error: errorMessage,
        })
    };
};

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

        // Parse JSON body with error handling
        let parsedBody;
        try {
            parsedBody = event.body ? JSON.parse(event.body) : {};
        } catch (parseError) {
            const lang = event.cookies?.language || "zh";
            const t = loadTranslations(lang);
            return createErrorResponse(
                400,
                'invalidJSON',
                t,
                event
            );
        }

        const isGenerateEmailCode = event.resource?.includes("/generate-email-code") || event.path?.includes("/generate-email-code");
        const isGenerateEmailCode2 = event.resource?.includes("/generate-email-code-2") || event.path?.includes("/generate-email-code-2") || event.resource?.includes("/register-email-app") || event.path?.includes("/register-email-app");

        if (isGenerateEmailCode2) {
            console.log("THIS IS DEV");
            //Change this code for enabling multiple language
            const lang = "zh";

            const t = loadTranslations(lang);
            const smtpHost = process.env.SMTP_HOST || 'web1018.dataplugs.com'; // Fallback to default
            console.log('SMTP Host:', smtpHost);

            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: 465,
                secure: true,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            // Test SMTP connection
            try {
                await transporter.verify();
                console.log('SMTP Server connection verified');
            } catch (err) {
                console.error('SMTP Connection Error:', err);
                return {
                    statusCode: 503,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders(event),
                    },
                    body: JSON.stringify({ 
                        error: getTranslation(t, 'emailServiceUnavailable'),
                        details: 'Failed to authenticate with SMTP server: ' + err.message 
                    }),
                };
            }

            // Get the current date and time
            var currentDateTime = new Date();

            // Add 300 seconds to the current date and time
            var resetCodeExpiry = new Date(currentDateTime.getTime() + 300000);

            // Generate a random 6-digit number
            const randomNumber = Math.floor(Math.random() * 1000000);
            const sixDigitString = (("000000" + randomNumber).slice(-6)).toString();
            console.log("SIX DIGIT STRING: " , sixDigitString);
            console.log("SIX DIGIT STRING IS IT STRING TYPE" , typeof sixDigitString);

            // Use parsed body
            const body = parsedBody;
            var email = body.email?.toLowerCase();

            if (!email) {
                return createErrorResponse(
                    400,
                    "missingEmailParams",
                    t,
                    event
                );
            }

            // Validate email format
            if (!isValidEmail(email)) {
                return createErrorResponse(
                    400,
                    "invalidEmailFormat",
                    t,
                    event
                );
            }

            // Define the filter and update operation
            const filter = { email: email };
            const update = {
                $set: {
                    passwordReset: {
                        resetCode: sixDigitString,
                        resetCodeExpiry: resetCodeExpiry.toISOString(),
                    },
                },
            };

            let html = `Your verification code is <b>${sixDigitString}</b><br>The code would be valid for 5 minutes`;

            // Use read connection for finding user
            const UserRead = readConn.model("User");
            const findResult = await UserRead.findOne(filter);

            if (findResult) {
                const info = await transporter.sendMail({
                    from: '"Pet Pet Club (Phealth)" <support@petpetclub.com.hk>',
                    to: email,
                    subject: "Pet Pet Club - Account Verification Code",
                    html: html,
                });
                
                // Connect to primary database for writes
                await connectToMongoDB();
                const UserModel = mongoose.model("User");
                
                await UserModel.findOneAndUpdate(filter, update);
                return {
                    statusCode: 201,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders(event),
                    },
                    body: JSON.stringify({
                        message:
                            getTranslation(t, "generateSuccessful"),
                        newUser: false
                    }),
                };
            } else {
                return {
                    statusCode: 201,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders(event),
                    },
                    body: JSON.stringify({ message: "User does not exist, Register first", newUser: true }),
                };
            }
        }
        else if (isGenerateEmailCode) {
            //Change this code for enabling multiple language
            const lang = "zh";

            const t = loadTranslations(lang);
            const smtpHost = process.env.SMTP_HOST || 'web1018.dataplugs.com'; // Fallback to default
            console.log('SMTP Host:', smtpHost);

            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: 465,
                secure: true,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });


            console.log("TRANSPORTER: ", transporter);
            // Test SMTP connection
            try {
                console.log("BEFORE TRANSPORTER");

                await transporter.verify();
                console.log('SMTP Server connection verified');
            } catch (err) {
                console.error('SMTP Connection Error:', err);
                return {
                    statusCode: 503,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders(event),
                    },
                    body: JSON.stringify({ 
                        error: getTranslation(t, 'emailServiceUnavailable'),
                        details: 'Failed to authenticate with SMTP server: ' + err.message 
                    }),
                };
            }

            // Get the current date and time
            var currentDateTime = new Date();
            console.log("GET CURRET DATE: ", currentDateTime);
            // Add 300 seconds to the current date and time
            var resetCodeExpiry = new Date(currentDateTime.getTime() + 300000);
            console.log("reset CODE EXPIRY: ", resetCodeExpiry);

            // Generate a random 6-digit number
            const randomNumber = Math.floor(Math.random() * 1000000);
            const sixDigitString = (("000000" + randomNumber).slice(-6)).toString();
            console.log("SIX DIGIT STRING: " , sixDigitString);
            // Use parsed body
            const body = parsedBody;
            var email = body.email?.toLowerCase();
            console.log("EMAIL: ", email);
            if (!email) {
                return createErrorResponse(
                    400,
                    "missingEmailParams",
                    t,
                    event
                );
            }

            // Validate email format
            if (!isValidEmail(email)) {
                return createErrorResponse(
                    400,
                    "invalidEmailFormat",
                    t,
                    event
                );
            }

            // Define the filter and update operation
            const filter = { email: email };
            const update = {
                $set: {
                    passwordReset: {
                        resetCode: sixDigitString,
                        resetCodeExpiry: resetCodeExpiry.toISOString(),
                    },
                },
            };

            let html = `您的驗證碼 <b>${sixDigitString}</b><br>此驗證碼有效期限為 5 分鐘`;

            // Use read connection for finding user
            const UserRead = readConn.model("User");
            const findResult = await UserRead.findOne(filter);
            console.log("BEFORE SENDING EMAIL: ", findResult);
            const info = await transporter.sendMail({
                from: '"Pet Pet Club (Phealth)" <support@petpetclub.com.hk>',
                to: email,
                subject: "Pet Pet Club - 帳戶驗證碼",
                html: html,
            });
            console.log("AFTER SENDING EMAIL: ", info);

            if (findResult) {
                console.log('TEST1234: FIND RESULT USER EXISTS');
                
                // Connect to primary database for writes
                await connectToMongoDB();
                const UserModel = mongoose.model("User");
                
                await UserModel.findOneAndUpdate(filter, update);
                return {
                    statusCode: 201,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders(event),
                    },
                    body: JSON.stringify({
                        message:
                            getTranslation(t, "generateSuccessful"),
                        newUser: findResult.newUser
                    }),
                };
            } else {
                // Connect to primary database for writes
                await connectToMongoDB();
                const UserModel = mongoose.model("User");
                
                // Create new user in primary database
                const newUser = new UserModel({
                    firstName: null,
                    lastName: null,
                    email: email,
                    password: null,
                    phoneNumber: null,
                    role: "user",
                    verified: false,
                    subscribe: false,
                    promotion: false,
                    district: null,
                    image: null,
                    birthday: null,
                    deleted: false,
                    credit: 300,
                    vetCredit: 300,
                    eyeAnalysisCredit: 300,
                    bloodAnalysisCredit: 300,
                    newUser: true,
                    gender: "",
                    passwordReset: {
                        resetCode: sixDigitString,
                        resetCodeExpiry: resetCodeExpiry.toISOString(),
                    },
                });

                await newUser.save();
                
                return {
                    statusCode: 201,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders(event),
                    },
                    body: JSON.stringify({ message: "User created and email is sent", newUser: true, uid: newUser._id}),
                };
            }
        }
        else {
            //Change this code for enabling multiple language
            const lang = event.cookies?.language || parsedBody.lang?.toLowerCase() || "zh";

            const t = loadTranslations(lang);
            // Use parsed body
            const body = parsedBody;

            const email = body.email?.toLowerCase();
            const resetCode = body.resetCode;
            // Use read connection for finding user
            const UserRead = readConn.model("User");
            const RefreshTokenRead = readConn.model("RefreshToken");

            console.log("BODY FROM EVENT: ", body);
            
            if (!email || !resetCode) {
                return createErrorResponse(
                    400,
                    "missingParams",
                    t,
                    event
                );
            }

            // Validate email format
            if (!isValidEmail(email)) {
                return createErrorResponse(
                    400,
                    "invalidEmailFormat",
                    t,
                    event
                );
            }

            // Validate reset code format
            if (!isValidResetCode(resetCode)) {
                return createErrorResponse(
                    400,
                    "invalidResetCodeFormat",
                    t,
                    event
                );
            }
            // Get the current date and time
            const currentDateTime = new Date();

            // Define the filter to match the document(s)
            const filter = { email: email };

            // Find the document (using read connection)
            const result = await UserRead.findOne({email: email});
            console.log("RESULT OF USER: ", result);
            if (!result) {
                return createErrorResponse(
                    404,
                    "notExist",
                    t,
                    event
                );
            }

            // Check if user account is deleted
            if (result.deleted === true) {
                return createErrorResponse(
                    403,
                    "accountDeleted",
                    t,
                    event
                );
            }

            // Check if passwordReset exists
            if (!result.passwordReset || !result.passwordReset.resetCode) {
                return createErrorResponse(
                    400,
                    "noCodeFound",
                    t,
                    event
                );
            }

            console.log("RESULT OF USER RESET CODE: ", result.passwordReset.resetCode);
            console.log("TYPE OF RESULT RESET CODE: ", typeof result.passwordReset.resetCode);
            console.log("RESET CODE FROM EVENT BODY: ", resetCode);
            console.log("TYPE OF RESETCODE: ", typeof resetCode);

            // Check reset code expiry
            if (!result.passwordReset.resetCodeExpiry) {
                return createErrorResponse(
                    400,
                    "noCodeFound",
                    t,
                    event
                );
            }

            const resetCodeExpiry = Date.parse(result.passwordReset.resetCodeExpiry);
            const timeDifference = (currentDateTime - resetCodeExpiry) / 1000;

            if (timeDifference > 300) {
                return createErrorResponse(
                    410,
                    "codeExpired",
                    t,
                    event
                );
            }
            console.log("RESULT OF RESET CODE: ", resetCode);
            // Convert both to strings for comparison (in case one is number and other is string)
            const storedCode = String(result.passwordReset.resetCode).trim();
            const providedCode = String(resetCode).trim();
            
            if (providedCode !== storedCode) {
                return createErrorResponse(
                    409,
                    "codeNotMatch",
                    t,
                    event
                );
            }

            const token = jwt.sign(
                {
                    userId: result._id,
                    userEmail: result.email,
                    userRole: result.role,
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
                userId: result._id,
                tokenHash: hashToken(newRefreshToken),
                createdAt: new Date(),
                lastUsedAt: new Date(),
                expiresAt: expiresAt
            });

            await newRefreshTokenRecord.save();

            console.log("RESULT newUSER: ", result.newUser);
            // Success response ADD SECURE; SAMESITE=NONE;
            return {
                statusCode: 201,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders(event),
                    "Set-Cookie": `refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${14 * 24 * 60 * 60}`,
                },
                body: JSON.stringify({
                    message: getTranslation(t, "verifySuccessful"),
                    uid: result._id,
                    newUser: result.newUser,
                    token: token,
                })
            };
        }

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: "Failed",
                message: error
            }),
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders(event),
            },
        };
    }
};