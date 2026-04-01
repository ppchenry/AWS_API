const mongoose = require("mongoose");
const { hashToken, generateRefreshToken, issueAccessToken } = require("./utils");
const RefreshTokenSchema = require("./models/RefreshToken");
const UserSchema = require("./models/User");
const { corsHeaders, handleOptions, ensureSingleOrigin } = require('./cors');


// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;
let connSecondary = null;

// Feature flag for dual write
const ENABLE_DUAL_WRITE = process.env.ENABLE_DUAL_WRITE === 'true' || process.env.ENABLE_DUAL_WRITE === '1';

// Secondary database name (can be overridden via environment variable)
const SECONDARY_DB_NAME = process.env.MONGODB_SECONDARY_DB_NAME || 'petpetclub_uat';

/**
 * Helper function to modify MongoDB URI to point to a different database
 * @param {string} uri - Original MongoDB URI
 * @param {string} dbName - Target database name
 * @returns {string} - Modified MongoDB URI
 */
const getMongoURIWithDatabase = (uri, dbName) => {
    if (!uri) return null;
    
    try {
        // MongoDB URI format: mongodb://[username:password@]host[:port][/database][?options]
        // or: mongodb+srv://[username:password@]host[/database][?options]
        
        // Check if URI already contains a database name
        // Pattern: /databaseName or /databaseName?options
        const dbNamePattern = /(\/([^/?]+))(\?|$)/;
        
        if (dbNamePattern.test(uri)) {
            // Replace existing database name
            return uri.replace(dbNamePattern, `/${dbName}$3`);
        } else {
            // No database name in URI, add it before query string or at the end
            if (uri.includes('?')) {
                // Has query parameters, insert database name before '?'
                return uri.replace('?', `/${dbName}?`);
            } else {
                // No query parameters, append database name
                return `${uri}/${dbName}`;
            }
        }
    } catch (error) {
        console.error("Error modifying MongoDB URI:", error);
        return null;
    }
};

const connectToMongoDB = async () => {
  // Check if already connected (readyState: 1 = connected, 2 = connecting)
  if (mongoose.connection.readyState === 1) {
    console.log("MongoDB already connected, reusing connection");
    return mongoose.connection;
  }

  // If connecting, wait for it (with timeout)
  if (mongoose.connection.readyState === 2) {
    console.log("MongoDB connection in progress, waiting...");
    await Promise.race([
      new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
        mongoose.connection.once('error', resolve);
      }),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 10000))
    ]);
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }
    // If still not connected after timeout, reset and reconnect
    console.log("Connection wait timed out, resetting...");
    await mongoose.disconnect();
    conn = null;
  }

  // Connect with proper options for Lambda
  try {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    
    // Register schemas
    mongoose.model("RefreshToken", RefreshTokenSchema, "refresh_tokens");
    mongoose.model("User", UserSchema, "users");
    
    return mongoose.connection;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    // Reset connection on error
    conn = null;
    throw error;
  }
};

const connectToSecondaryMongoDB = async () => {
  // Only connect to secondary if dual write is enabled
  if (!ENABLE_DUAL_WRITE) {
    return null;
  }

  if (!process.env.MONGODB_URI) {
    console.warn("ENABLE_DUAL_WRITE is true but MONGODB_URI is not set");
    return null;
  }

  if (connSecondary == null) {
    try {
      // Use the same URI but connect to secondary database
      const secondaryURI = getMongoURIWithDatabase(process.env.MONGODB_URI, SECONDARY_DB_NAME);
      
      if (!secondaryURI) {
        console.warn("Failed to construct secondary MongoDB URI");
        return null;
      }

      console.log(`Connecting to secondary database: ${SECONDARY_DB_NAME}`);
      // Create a separate connection for secondary database
      connSecondary = await mongoose.createConnection(secondaryURI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      });
      console.log(`MongoDB secondary connected to database: ${SECONDARY_DB_NAME}`);
      connSecondary.model("RefreshToken", RefreshTokenSchema, "refresh_tokens");
      connSecondary.model("User", UserSchema, "users");
    } catch (error) {
      console.error("Failed to connect to secondary MongoDB:", error);
      // Don't throw - allow primary operations to continue
      return null;
    }
  }
  return connSecondary;
};

/**
 * Get the appropriate MongoDB connection based on dual write flag
 * For reads: returns secondary connection if dual write is enabled, otherwise primary
 * For writes: returns primary connection (secondary write handled separately)
 */
const getReadConnection = async () => {
  if (ENABLE_DUAL_WRITE) {
    const secondaryConn = await connectToSecondaryMongoDB();
    if (secondaryConn) {
      console.log("Reading from secondary database.");
      return secondaryConn;
    } else {
      console.warn("Dual write enabled but secondary connection unavailable for read. Falling back to primary.");
    }
  }
  console.log("Reading from primary database.");
  return connectToMongoDB();
};

exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
  context.callbackWaitsForEmptyEventLoop = false;

  // Log that Lambda was invoked
  console.log("=== LAMBDA INVOKED ===");
  console.log("HTTP Method:", event.httpMethod);
  console.log("Resource:", event.resource);
  console.log("Path:", event.path);
  console.log("Request ID:", context.requestId);
  console.log("HEADERS:", event.headers);
  console.log("COOKIE FIELD:", event.cookie);


   // Handle OPTIONS requests (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    console.log("OPTIONS request detected in Lambda handler");
    try {
      return handleOptions(event);
    } catch (error) {
      console.error("Error in handleOptions:", error);
      // Always return CORS headers even on error
      const origin = event.headers?.origin || event.headers?.Origin || "*";
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": origin === "*" ? "*" : origin,
          "Access-Control-Allow-Credentials": origin !== "*" ? "true" : undefined,
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        body: "",
      };
    }
  }

  try {
    // Get appropriate connection based on dual write flag (for initial reads)
    const readConn = await getReadConnection();
    const dbName = ENABLE_DUAL_WRITE ? SECONDARY_DB_NAME : 'petpetclub';
    console.log(`Reading from database: ${dbName}`);

    let cookie = '';
    if (event.cookies && Array.isArray(event.cookies) && event.cookies.length > 0) {
      cookie = event.cookies.join('; ');
    } else if (event.headers?.cookie || event.headers?.Cookie) {
      cookie = event.headers.cookie || event.headers.Cookie;
    } else {
      console.log("NO COOKIES found in event");
    }
    
    console.log("EVENT HEADERS:", event.headers);
    console.log("COOKIE STRING:", cookie);
    
    console.log("EVENT HEADERS: ",event.headers);
    if (!cookie) {
      const corsHeadersObj = ensureSingleOrigin(corsHeaders(event));
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeadersObj
        },
        body: JSON.stringify({ error: "Missing refresh token cookie" })
      };
    }

    const match = cookie.match(/refreshToken=([^;]+)/);
    if (!match) {
      const corsHeadersObj = ensureSingleOrigin(corsHeaders(event));
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeadersObj
        },
        body: JSON.stringify({ error: "Invalid refresh token cookie format" })
      };
    }

    // Use read connection for finding refresh token
    const RefreshTokenRead = readConn.model("RefreshToken");
    const UserRead = readConn.model("User");

    const tokenHash = hashToken(match[1]);
    const record = await RefreshTokenRead.findOne({ tokenHash });

    if (!record || record.expiresAt < new Date()) {
      const corsHeadersObj = ensureSingleOrigin(corsHeaders(event));
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeadersObj
        },
        body: JSON.stringify({ error: "Refresh token expired or invalid" })
      };
    }

    // Connect to primary database for writes
    await connectToMongoDB();
    const RefreshTokenModel = mongoose.model("RefreshToken");
    const UserModel = mongoose.model("User");

    // Delete old refresh token from primary database
    await RefreshTokenModel.deleteOne({ tokenHash });

    // Dual write: Delete old refresh token from secondary database if enabled
    if (ENABLE_DUAL_WRITE) {
      const secondaryConn = await connectToSecondaryMongoDB();
      if (secondaryConn) {
        try {
          const SecondaryRefreshToken = secondaryConn.model("RefreshToken");
          await SecondaryRefreshToken.deleteOne({ tokenHash });
          console.log("Old refresh token successfully deleted from secondary database");
        } catch (error) {
          console.error("Failed to delete old refresh token from secondary database:", error);
          console.error("Primary delete succeeded, secondary delete failed");
        }
      } else {
        console.warn("Dual write enabled but secondary connection unavailable");
      }
    }

    // Generate new refresh token
    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    // Create new refresh token record in primary database
    const newRefreshTokenRecord = new RefreshTokenModel({
      userId: record.userId,
      tokenHash: hashToken(newRefreshToken),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: expiresAt
    });

    await newRefreshTokenRecord.save();

    // Dual write: Create new refresh token in secondary database if enabled
    if (ENABLE_DUAL_WRITE) {
      const secondaryConn = await connectToSecondaryMongoDB();
      if (secondaryConn) {
        try {
          const SecondaryRefreshToken = secondaryConn.model("RefreshToken");
          await SecondaryRefreshToken.create({ ...newRefreshTokenRecord.toObject(), _id: newRefreshTokenRecord._id });
          console.log("New refresh token successfully written to secondary database:", newRefreshTokenRecord._id);
        } catch (error) {
          console.error("Failed to write new refresh token to secondary database:", error);
          console.error("Primary write succeeded, secondary write failed for refresh token:", newRefreshTokenRecord._id);
        }
      } else {
        console.warn("Dual write enabled but secondary connection unavailable");
      }
    }

    // Get user and issue new access token (using read connection)
    const user = await UserRead.findOne({ _id: record.userId });
    if (!user) {
      const corsHeadersObj = ensureSingleOrigin(corsHeaders(event));
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeadersObj
        },
        body: JSON.stringify({ error: "User not found" })
      };
    }

    const accessToken = issueAccessToken(user);


    // Get CORS headers and ensure single origin value
    const corsHeadersObj = ensureSingleOrigin(corsHeaders(event));

    //ADD SECURE; SAMESITE=NONE;
    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": `refreshToken=${newRefreshToken}; Secure; SameSite=None; HttpOnly; Path=/; Max-Age=${14 * 24 * 60 * 60}`,
        ...corsHeadersObj
      },
      body: JSON.stringify({ accessToken, id: user._id })
    };
  } catch (error) {
    console.error("Error in auth route:", error);
    const corsHeadersObj = ensureSingleOrigin(corsHeaders(event));
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeadersObj
      },
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};