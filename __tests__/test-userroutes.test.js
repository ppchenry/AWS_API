/**
 * UserRoutes Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test
 */

const jwt = require("../functions/UserRoutes/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

const BASE_URL = "http://localhost:3000";
const TEST_TS = Date.now();
const JWT_SECRET = envConfig.UserRoutesFunction.JWT_SECRET;
const MONGODB_URI = envConfig.UserRoutesFunction?.MONGODB_URI || "";
const SESSION_TEST_IP = `198.51.100.${(TEST_TS % 200) + 1}`;
const CROSS_REGISTER_HEADERS = { "x-forwarded-for": `cross-register-${TEST_TS}` };

let mongoose;
let dbReady = false;
let connectAttempted = false;

async function connectDB() {
  if (dbReady || connectAttempted || !MONGODB_URI) return;
  connectAttempted = true;
  try {
    require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
    mongoose = require("mongoose");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      });
    }
    dbReady = true;
  } catch (err) {
    console.warn("[test] MongoDB unavailable - DB-backed UserRoutes checks will be skipped:", err.message);
    dbReady = false;
  }
}

async function disconnectDB() {
  if (dbReady && mongoose) {
    await mongoose.disconnect();
    dbReady = false;
  }
}

function ngosCol() {
  return mongoose.connection.db.collection("ngos");
}

const dbTest = MONGODB_URI
  ? (name, fn) => test(name, async () => {
      await connectDB();
      if (!dbReady) {
        console.log(`[skip] ${name} - no DB connection`);
        return;
      }
      await fn();
    })
  : test.skip;

// Shared state across ordered tests
const state = {
  userId: null,
  email: `testuser_${TEST_TS}@test.com`,
  password: "Test1234!",
  phoneOnly: `+8526${String(TEST_TS).slice(-7)}`,
  token: null,
  // NGO test state
  ngoUserId: null,
  ngoEmail: `testngo_${TEST_TS}@test.com`,
  ngoPassword: "Test1234!",
  ngoPhone: `+852${TEST_TS.toString().slice(-8)}`,
  ngoToken: null,
  ngoId: "686f3f6f2ad9f96799b53564",
};

async function req(method, path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": SESSION_TEST_IP,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

async function rawReq(method, path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": SESSION_TEST_IP,
      ...headers,
    },
    body,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

afterAll(async () => {
  await disconnectDB();
});

// Returns Authorization header if token is available
function auth() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

// Returns NGO Authorization header if ngoToken is available
function ngoAuth() {
  return state.ngoToken ? { Authorization: `Bearer ${state.ngoToken}` } : {};
}

function expiredAuth(overrides = {}) {
  const token = jwt.sign(
    {
      userId: state.userId,
      userEmail: state.email,
      userRole: "user",
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: -60 }
  );

  return { Authorization: `Bearer ${token}` };
}

// ─── Register ────────────────────────────────────────────────────────────────

describe("POST /account/register", () => {
  test("registers a new user", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Test",
      lastName: "User",
      email: state.email,
      password: state.password,
    });
    expect(res.status).toBe(201);
    state.userId = res.body?.id;
    expect(res.body?.token).toBeUndefined();
    expect(res.body?.user?.hasPassword).toBe(true);
  });

  test("allows phone-only registration without password", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Phone",
      lastName: "Only",
      phoneNumber: state.phoneOnly,
    });
    expect(res.status).toBe(201);
    expect(res.body?.user?.phoneNumber).toMatch(/^\+852/);
    expect(res.body?.user?.hasPassword).toBe(false);
  });

  test("returns 201 for duplicate unverified email so frontend can continue verification", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Test",
      lastName: "User",
      email: state.email,
      password: state.password,
    });
    expect(res.status).toBe(201);
    expect(res.body?.continueVerification).toBe(true);
    expect(String(res.body?.id)).toBe(String(state.userId));
    expect(res.body?.user?.verified).toBe(false);
  });

  test("returns 201 for duplicate unverified email with different casing", async () => {
    const [localPart, domain] = state.email.split("@");
    const res = await req("POST", "/account/register", {
      firstName: "Case",
      lastName: "Duplicate",
      email: `${localPart.toUpperCase()}@${domain.toUpperCase()}`,
      password: "Test1234!",
    });
    expect(res.status).toBe(201);
    expect(res.body?.continueVerification).toBe(true);
    expect(String(res.body?.id)).toBe(String(state.userId));
    expect(res.body?.user?.verified).toBe(false);
  });

  test("returns 201 for duplicate unverified phone so frontend can continue verification", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Phone",
      lastName: "Retry",
      phoneNumber: state.phoneOnly,
    });
    expect(res.status).toBe(201);
    expect(res.body?.continueVerification).toBe(true);
    expect(res.body?.user?.phoneNumber).toBe(state.phoneOnly);
    expect(res.body?.user?.verified).toBe(false);
  });

  test("rejects missing firstName → 400", async () => {
    const res = await req("POST", "/account/register", {
      email: `nofirst_${Date.now()}@test.com`,
      password: "Test1234!",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("register.errors.firstNameRequired");
  });

  test("rejects missing email and phone → 400", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Test",
      lastName: "User",
      password: "Test1234!",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("register.errors.emailOrPhoneRequired");
  });

  test("rejects password shorter than 8 chars → 400", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Test",
      lastName: "User",
      email: `shortpw_${Date.now()}@test.com`,
      password: "123",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("register.errors.passwordRequired");
  });

  test("rejects phone plus password without email → 400", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Phone",
      lastName: "Password",
      phoneNumber: `+8525${String(TEST_TS).slice(-7)}`,
      password: "Test1234!",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("register.errors.emailRequiredWithPassword");
  });

  test("rejects invalid email format → 400", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Test",
      lastName: "User",
      email: "not-an-email",
      password: "Test1234!",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("register.errors.invalidEmailFormat");
  });

  test("ignores role in request body and creates a normal user", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Role",
      lastName: "Injection",
      email: `roleinject_${Date.now()}@test.com`,
      password: "Test1234!",
      role: "ngo",
    });
    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("user");
  });

  test("rejects NoSQL injection object in email field → 400", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Nosql",
      lastName: "Register",
      email: { $gt: "" },
      password: "Test1234!",
    });
    expect(res.status).toBe(400);
    expect(typeof res.body.errorKey).toBe("string");
  });

  test("rate limits repeated register attempts from the same IP → 429", async () => {
    const headers = { "x-forwarded-for": `198.51.101.${(TEST_TS % 200) + 1}` };

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await req("POST", "/account/register", {
        firstName: "Burst",
        lastName: `User${attempt}`,
        email: `burst_register_${TEST_TS}_${attempt}@test.com`,
        password: "Test1234!",
      }, headers);
      expect(res.status).toBe(201);
    }

    const blocked = await req("POST", "/account/register", {
      firstName: "Burst",
      lastName: "Blocked",
      email: `burst_register_${TEST_TS}_blocked@test.com`,
      password: "Test1234!",
    }, headers);
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorKey).toBe("others.rateLimited");
  });
});

// ─── Login ───────────────────────────────────────────────────────────────────

describe("POST /account/login", () => {
  test("logs in with valid credentials", async () => {
    const res = await req("POST", "/account/login", {
      email: state.email,
      password: state.password,
    });
    expect(res.status).toBe(200);
    state.token = res.body?.token;
    if (!state.userId) state.userId = res.body?.userId?.toString();
  });

  test("rejects wrong password → 401", async () => {
    const res = await req("POST", "/account/login", {
      email: state.email,
      password: "WrongPassword!",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("emailLogin.invalidUserCredential");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(typeof res.body.requestId).toBe("string");
  });

  test("rejects non-existent user → 401", async () => {
    const res = await req("POST", "/account/login", {
      email: "nobody@nowhere.com",
      password: "Test1234!",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("emailLogin.invalidUserCredential");
  });

  test("rejects missing password → 400", async () => {
    const res = await req("POST", "/account/login", { email: state.email });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("emailLogin.paramsMissing");
  });

  test("rejects invalid email format → 400", async () => {
    const res = await req("POST", "/account/login", {
      email: "notanemail",
      password: "Test1234!",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("emailLogin.invalidEmailFormat");
  });

  test("rejects malformed JSON body → 400", async () => {
    const res = await rawReq("POST", "/account/login", '{"email":"broken"');
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rate limits repeated failed login attempts → 429", async () => {
    const rateLimitedEmail = `ratelimit_${TEST_TS}@test.com`;

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const res = await req("POST", "/account/login", {
        email: rateLimitedEmail,
        password: "WrongPassword!",
      });
      expect(res.status).toBe(401);
      expect(res.body.errorKey).toBe("emailLogin.invalidUserCredential");
    }

    const blocked = await req("POST", "/account/login", {
      email: rateLimitedEmail,
      password: "WrongPassword!",
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorKey).toBe("others.rateLimited");
  });

  test("rejects missing Authorization header on protected route → 401", async () => {
    const res = await req("GET", `/account/${state.userId}`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Authorization token on protected route → 401", async () => {
    const res = await req("GET", `/account/${state.userId}`, undefined, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT on protected route → 401", async () => {
    const res = await req("GET", `/account/${state.userId}`, undefined, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });
});

// ─── Login-2 ─────────────────────────────────────────────────────────────────

describe("POST /account/login-2", () => {
  test("returns 405 for deprecated endpoint", async () => {
    const res = await req("POST", "/account/login-2", { email: state.email });
    expect(res.status).toBe(405);
    expect(res.body.errorKey).toBe("others.methodNotAllowed");
  });

  test("still rejects empty body before routing → 400", async () => {
    const res = await req("POST", "/account/login-2", {});
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });
});

// ─── Get User ────────────────────────────────────────────────────────────────

describe("GET /account/{userId}", () => {
  test("gets user by id", async () => {
    const res = await req("GET", `/account/${state.userId}`, undefined, auth());
    expect(res.status).toBe(200);
    expect(res.body?.user?.password).toBeUndefined();
  });

  test("returns 403 for a different userId (self-access enforced)", async () => {
    const res = await req("GET", "/account/000000000000000000000000", undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });
});

// ─── Update User Details ─────────────────────────────────────────────────────

describe("PUT /account", () => {
  test("updates user details", async () => {
    const res = await req("PUT", "/account", {
      userId: state.userId,
      firstName: "Updated",
    }, auth());
    expect(res.status).toBe(200);
  });

  test("rejects missing userId → 400", async () => {
    const res = await req("PUT", "/account", { firstName: "No ID" }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidPUT");
  });

  test("rejects mismatched userId → 403 (self-access enforced)", async () => {
    const res = await req("PUT", "/account", { userId: "000000000000000000000000", firstName: "Bad" }, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects invalid email format → 400", async () => {
    const res = await req("PUT", "/account", {
      userId: state.userId,
      email: "not-an-email",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidEmailFormat");
  });

  test("rejects malformed JSON body → 400", async () => {
    const res = await rawReq("PUT", "/account", '{"userId":"broken"', auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rejects NoSQL injection object in email field → 400", async () => {
    const res = await req("PUT", "/account", {
      userId: state.userId,
      email: { $gt: "" },
    }, auth());
    expect(res.status).toBe(400);
    expect(typeof res.body.errorKey).toBe("string");
  });
});

// ─── Update Password ─────────────────────────────────────────────────────────

describe("PUT /account/update-password", () => {
  test("rejects same old and new password → 400", async () => {
    const res = await req("PUT", "/account/update-password", {
      userId: state.userId,
      oldPassword: state.password,
      newPassword: state.password,
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updatePassword.passwordUnchanged");
  });

  test("rejects wrong old password → 400", async () => {
    const res = await req("PUT", "/account/update-password", {
      userId: state.userId,
      oldPassword: "WrongOldPassword!",
      newPassword: "NewTest1234!",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updatePassword.currentPasswordInvalid");
  });

  test("rejects new password shorter than 8 chars → 400", async () => {
    const res = await req("PUT", "/account/update-password", {
      userId: state.userId,
      oldPassword: state.password,
      newPassword: "short",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updatePassword.passwordLong");
  });

  test("updates password successfully", async () => {
    const res = await req("PUT", "/account/update-password", {
      userId: state.userId,
      oldPassword: state.password,
      newPassword: "NewTest1234!",
    }, auth());
    expect(res.status).toBe(200);
    state.password = "NewTest1234!";
  });
});

// ─── Update Image ─────────────────────────────────────────────────────────────

describe("POST /account/update-image", () => {
  test("updates user image", async () => {
    const res = await req("POST", "/account/update-image", {
      userId: state.userId,
      image: "https://example.com/photo.jpg",
    }, auth());
    expect(res.status).toBe(200);
  });

  test("rejects invalid image URL → 400", async () => {
    const res = await req("POST", "/account/update-image", {
      userId: state.userId,
      image: "not-a-url",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updateImage.invalidImageUrl");
  });

  test("rejects missing userId → 400", async () => {
    const res = await req("POST", "/account/update-image", {
      image: "https://example.com/photo.jpg",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updateImage.invalidUserId");
  });
});

// ─── NGO User List ────────────────────────────────────────────────────────────

// ─── Not Implemented ─────────────────────────────────────────────────────────

describe("Not implemented routes", () => {
  test.each([
    ["POST", "/account/register-by-email"],
    ["POST", "/account/register-by-phoneNumber"],
    ["POST", "/account/register-email-2"],
  ])("%s %s → 405", async (method, path) => {
    // non-empty body needed to pass the guard's empty-body check
    const res = await req(method, path, { dummy: true });
    expect(res.status).toBe(405);
    expect(res.body.errorKey).toBe("others.methodNotAllowed");
  });
});

// ─── Register NGO ───────────────────────────────────────────────────────────

describe("POST /account/register-ngo", () => {
  test("registers a new NGO", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "TestNgo",
      lastName: "Admin",
      email: state.ngoEmail,
      phoneNumber: state.ngoPhone,
      password: state.ngoPassword,
      confirmPassword: state.ngoPassword,
      ngoName: `Test NGO ${TEST_TS}`,
      ngoPrefix: TEST_TS.toString().slice(-5),
      businessRegistrationNumber: `BR${TEST_TS.toString().slice(-8)}`,
      address: "123 Test Street, Hong Kong",
    });
    expect(res.status).toBe(201);
    state.ngoUserId = res.body?.userId?.toString();
    state.ngoId = res.body?.ngoId?.toString();
    state.ngoToken = res.body?.token;
    expect(res.body?.role).toBe("ngo");
    expect(res.body?.isVerified).toBe(true);
    expect(typeof res.body?.token).toBe("string");
  });

  test("rejects duplicate NGO email → 409", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "TestNgo",
      lastName: "Admin",
      email: state.ngoEmail,
      phoneNumber: "+85298765432",
      password: state.ngoPassword,
      confirmPassword: state.ngoPassword,
      ngoName: `Dup NGO ${TEST_TS}`,
      ngoPrefix: "DUPPP",
      businessRegistrationNumber: `BRDUP${TEST_TS.toString().slice(-5)}`,
      address: "456 Test Street",
    });
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("phoneRegister.userExist");
  });

  test("rejects email already registered by a normal user → 409", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "Existing",
      lastName: "User",
      email: state.email,
      phoneNumber: "+85212345670",
      password: state.ngoPassword,
      confirmPassword: state.ngoPassword,
      ngoName: `Existing User NGO ${TEST_TS}`,
      ngoPrefix: "EXUSR",
      businessRegistrationNumber: `BRXU${TEST_TS.toString().slice(-6)}`,
      address: "Existing User Street",
    });
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("phoneRegister.userExist");
  });

  test("rejects duplicate NGO phone → 409", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "Phone",
      lastName: "Conflict",
      email: `dup_phone_${TEST_TS}@test.com`,
      phoneNumber: state.ngoPhone,
      password: state.ngoPassword,
      confirmPassword: state.ngoPassword,
      ngoName: `Dup Phone NGO ${TEST_TS}`,
      ngoPrefix: "DUPPH",
      businessRegistrationNumber: `BRDP${TEST_TS.toString().slice(-6)}`,
      address: "Phone Conflict Street",
    });
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("emailRegister.existWithPhone");
  });

  test("rejects duplicate business registration number → 409", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "Dup",
      lastName: "BusinessReg",
      email: `dup_br_${TEST_TS}@test.com`,
      phoneNumber: `+8529${TEST_TS.toString().slice(-7)}`,
      password: state.ngoPassword,
      confirmPassword: state.ngoPassword,
      ngoName: `Dup BR NGO ${TEST_TS}`,
      ngoPrefix: "DUPBR",
      businessRegistrationNumber: `BR${TEST_TS.toString().slice(-8)}`,
      address: "Business Reg Conflict Street",
    });
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("registerNgo.duplicateBusinessReg");
  });

  test("rejects password mismatch → 400", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "TestNgo",
      lastName: "Admin",
      email: `mismatch_${TEST_TS}@test.com`,
      phoneNumber: "+85211111111",
      password: "Test1234!",
      confirmPassword: "Different1234!",
      ngoName: "Mismatch NGO",
      ngoPrefix: "MSMCH",
      businessRegistrationNumber: "BR_MISMATCH",
      address: "789 Test Street",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("registerNgo.errors.passwordMismatch");
  });

  test("rejects missing required fields → 400", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "TestNgo",
      password: "Test1234!",
      confirmPassword: "Test1234!",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("registerNgo.errors.lastNameRequired");
  });

  test("rejects invalid phone format → 400", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "TestNgo",
      lastName: "Admin",
      email: `badphone_${TEST_TS}@test.com`,
      phoneNumber: "not-a-phone",
      password: "Test1234!",
      confirmPassword: "Test1234!",
      ngoName: "Bad Phone NGO",
      ngoPrefix: "BPHON",
      businessRegistrationNumber: "BR_BADPHONE",
      address: "101 Test Street",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("emailRegister.invalidPhoneFormat");
  });

  test("rejects NoSQL injection object in NGO email field → 400", async () => {
    const res = await req("POST", "/account/register-ngo", {
      firstName: "Nosql",
      lastName: "Ngo",
      email: { $gt: "" },
      phoneNumber: "+85212344321",
      password: "Test1234!",
      confirmPassword: "Test1234!",
      ngoName: `Nosql NGO ${TEST_TS}`,
      ngoPrefix: "NSQL1",
      businessRegistrationNumber: `BRNS${TEST_TS.toString().slice(-6)}`,
      address: "Nosql Street",
    }, { "x-forwarded-for": `198.51.102.${(TEST_TS % 200) + 1}` });
    expect(res.status).toBe(400);
    expect(typeof res.body.errorKey).toBe("string");
  });

  test("rate limits repeated NGO registration attempts from the same IP → 429", async () => {
    const headers = { "x-forwarded-for": `198.51.103.${(TEST_TS % 200) + 1}` };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const res = await req("POST", "/account/register-ngo", {
        firstName: "BurstNgo",
        lastName: `Admin${attempt}`,
        email: `burst_ngo_${TEST_TS}_${attempt}@test.com`,
        phoneNumber: `+8527${String(TEST_TS + attempt).slice(-7)}`,
        password: state.ngoPassword,
        confirmPassword: state.ngoPassword,
        ngoName: `Burst NGO ${TEST_TS} ${attempt}`,
        ngoPrefix: `B${String(attempt).padStart(4, "0")}`,
        businessRegistrationNumber: `BRNG${String(TEST_TS + attempt).slice(-6)}`,
        address: "Burst NGO Street",
      }, headers);
      expect(res.status).toBe(201);
    }

    const blocked = await req("POST", "/account/register-ngo", {
      firstName: "BurstNgo",
      lastName: "Blocked",
      email: `burst_ngo_${TEST_TS}_blocked@test.com`,
      phoneNumber: `+8528${String(TEST_TS).slice(-7)}`,
      password: state.ngoPassword,
      confirmPassword: state.ngoPassword,
      ngoName: `Burst NGO ${TEST_TS} blocked`,
      ngoPrefix: "BLKED",
      businessRegistrationNumber: `BRBL${String(TEST_TS).slice(-6)}`,
      address: "Blocked NGO Street",
    }, headers);
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorKey).toBe("others.rateLimited");
  });
});

describe("Cross-registration duplicate protection", () => {
  test("POST /account/register rejects email already registered by an NGO user → 409", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Dup",
      lastName: "NgoEmail",
      email: state.ngoEmail,
      password: "Test1234!",
    }, CROSS_REGISTER_HEADERS);
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("phoneRegister.existWithEmail");
  });
});

// ─── NGO Login ────────────────────────────────────────────────────────────────

describe("POST /account/login (NGO)", () => {
  test("logs in as NGO user and captures token", async () => {
    const res = await req("POST", "/account/login", {
      email: state.ngoEmail,
      password: state.ngoPassword,
    });
    expect(res.status).toBe(200);
    state.ngoToken = res.body?.token;
    expect(res.body?.role).toBe("ngo");
    expect(res.body?.isVerified).toBe(true);
  });

  dbTest("rejects NGO login when approval is revoked", async () => {
    const ngoObjectId = new mongoose.Types.ObjectId(state.ngoId);
    const originalNgo = await ngosCol().findOne({ _id: ngoObjectId });

    expect(originalNgo).toBeTruthy();

    await ngosCol().updateOne(
      { _id: ngoObjectId },
      { $set: { isVerified: false } }
    );

    try {
      const res = await req("POST", "/account/login", {
        email: state.ngoEmail,
        password: state.ngoPassword,
      }, { "x-forwarded-for": `ngo-approval-${TEST_TS}` });

      expect(res.status).toBe(403);
      expect(res.body?.errorKey).toBe("emailLogin.ngoApprovalRequired");
    } finally {
      await ngosCol().updateOne(
        { _id: ngoObjectId },
        {
          $set: {
            isActive: originalNgo.isActive,
            isVerified: originalNgo.isVerified,
          },
        }
      );
    }
  });
});

// ─── NGO User List ────────────────────────────────────────────────────────────
// Placed after NGO login so ngoToken is guaranteed to be populated.

describe("GET /account/user-list", () => {
  test("returns user list for NGO user → 200", async () => {
    const res = await req("GET", "/account/user-list", undefined, ngoAuth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.userList)).toBe(true);
  });

  test("accepts page and search query params → 200", async () => {
    const res = await req("GET", "/account/user-list?page=1&search=test", undefined, ngoAuth());
    expect(res.status).toBe(200);
  });

  test("rejects regular user token → 403", async () => {
    const res = await req("GET", "/account/user-list", undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects missing Authorization header → 401", async () => {
    const res = await req("GET", "/account/user-list");
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });
});

// ─── NGO Endpoints ────────────────────────────────────────────────────────────

describe("GET /account/edit-ngo/{ngoId}", () => {
  test("fetches NGO details", async () => {
    const res = await req("GET", `/account/edit-ngo/${state.ngoId}`, undefined, ngoAuth());
    expect(res.status).toBe(200);
    expect(res.body?.userProfile?.password).toBeUndefined();
  });

  test("rejects regular user token → 403", async () => {
    const res = await req("GET", `/account/edit-ngo/${state.ngoId}`, undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects missing Authorization header → 401", async () => {
    const res = await req("GET", `/account/edit-ngo/${state.ngoId}`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects invalid ngoId format → 400", async () => {
    const res = await req("GET", "/account/edit-ngo/not-a-valid-id", undefined, ngoAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("ngo.invalidId");
  });

  test("returns 404 for non-existent ngoId", async () => {
    const res = await req("GET", "/account/edit-ngo/000000000000000000000000", undefined, ngoAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("ngo.notFound");
  });
});

describe("PUT /account/edit-ngo/{ngoId}", () => {
  test("updates NGO details", async () => {
    const res = await req("PUT", `/account/edit-ngo/${state.ngoId}`, {
      ngoProfile: { description: "Updated by test" },
    }, ngoAuth());
    expect(res.status).toBe(200);
  });

  test("rejects regular user token → 403", async () => {
    const res = await req("PUT", `/account/edit-ngo/${state.ngoId}`, {
      ngoProfile: { description: "Should fail" },
    }, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects missing Authorization header → 401", async () => {
    const res = await req("PUT", `/account/edit-ngo/${state.ngoId}`, {
      ngoProfile: { description: "Should fail" },
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects duplicate user email → 409", async () => {
    const res = await req("PUT", `/account/edit-ngo/${state.ngoId}`, {
      userProfile: { email: state.email },
    }, ngoAuth());
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("others.emailExists");
  });

  test("rejects duplicate registrationNumber → 409", async () => {
    // Register a second NGO using isolated, per-test identifiers to avoid collisions
    // with persistent integration-test data from earlier runs.
    const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const secondBr = `BRDUP2_${uniqueSuffix}`;
    const setupRes = await req("POST", "/account/register-ngo", {
      firstName: "Second",
      lastName: "Ngo",
      email: `second_ngo_${uniqueSuffix}@test.com`,
      phoneNumber: `+8529${uniqueSuffix.slice(-7)}`,
      password: state.ngoPassword,
      confirmPassword: state.ngoPassword,
      ngoName: `Second NGO ${uniqueSuffix}`,
      ngoPrefix: `S${uniqueSuffix.slice(-4)}`,
      businessRegistrationNumber: secondBr,
      address: "Second NGO Street",
    }, { "x-forwarded-for": `198.51.105.${(TEST_TS % 200) + 1}` });
    expect(setupRes.status).toBe(201);

    const res = await req("PUT", `/account/edit-ngo/${state.ngoId}`, {
      ngoProfile: { registrationNumber: secondBr },
    }, ngoAuth());
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("others.registrationNumberExists");
  });
});

describe("GET /account/edit-ngo/{ngoId}/pet-placement-options", () => {
  test("fetches pet placement options", async () => {
    const res = await req("GET", `/account/edit-ngo/${state.ngoId}/pet-placement-options`, undefined, ngoAuth());
    expect(res.status).toBe(200);
  });

  test("rejects regular user token → 403", async () => {
    const res = await req("GET", `/account/edit-ngo/${state.ngoId}/pet-placement-options`, undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects missing Authorization header → 401", async () => {
    const res = await req("GET", `/account/edit-ngo/${state.ngoId}/pet-placement-options`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects invalid ngoId format → 400", async () => {
    const res = await req("GET", "/account/edit-ngo/not-a-valid-id/pet-placement-options", undefined, ngoAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("ngo.invalidId");
  });

  test("returns 404 for non-existent ngoId", async () => {
    const res = await req("GET", "/account/edit-ngo/000000000000000000000000/pet-placement-options", undefined, ngoAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("ngo.notFound");
  });
});

// ─── Delete User by Email ─────────────────────────────────────────────────────

describe("POST /account/delete-user-with-email", () => {
  const SAC_EMAIL = `sacuser_${TEST_TS}@test.com`;
  const SAC_PASS = "Test1234!";
  const SAC_HEADERS = { "x-forwarded-for": `198.51.106.${(TEST_TS % 200) + 1}` };
  let sacToken = null;

  test("setup: registers sacrificial user", async () => {
    const res = await req("POST", "/account/register", {
      firstName: "Sac",
      lastName: "User",
      email: SAC_EMAIL,
      password: SAC_PASS,
    }, SAC_HEADERS);
    expect(res.status).toBe(201);
  });

  test("setup: logs in as sacrificial user", async () => {
    const res = await req("POST", "/account/login", {
      email: SAC_EMAIL,
      password: SAC_PASS,
    }, SAC_HEADERS);
    expect(res.status).toBe(200);
    sacToken = res.body?.token;
  });

  test("rejects missing email → 400", async () => {
    const res = await req("POST", "/account/delete-user-with-email", {},
      sacToken ? { Authorization: `Bearer ${sacToken}` } : {});
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects mismatched email → 403 (self-access enforced)", async () => {
    const res = await req("POST", "/account/delete-user-with-email",
      { email: "other@test.com" },
      sacToken ? { Authorization: `Bearer ${sacToken}` } : {});
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("deletes user by email → 200", async () => {
    const res = await req("POST", "/account/delete-user-with-email",
      { email: SAC_EMAIL },
      sacToken ? { Authorization: `Bearer ${sacToken}` } : {});
    expect(res.status).toBe(200);
  });

  test("returns 409 for already-deleted user", async () => {
    const res = await req("POST", "/account/delete-user-with-email",
      { email: SAC_EMAIL },
      sacToken ? { Authorization: `Bearer ${sacToken}` } : {});
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("deleteAccount.userAlreadyDeleted");
  });
});

// ─── Generate SMS Code ────────────────────────────────────────────────────────

describe("POST /account/generate-sms-code", () => {
  // test("sends SMS to existing number → 201", async () => {
  //   const res = await req("POST", "/account/generate-sms-code", {
  //     phoneNumber: "+85252668385",
  //   });
  //   expect(res.status).toBe(201);
  //   expect(res.body?.newUser).toBe(false);
  // });

  test("rejects missing phoneNumber → 400", async () => {
    const res = await req("POST", "/account/generate-sms-code", {});
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects invalid phone format → 400", async () => {
    const res = await req("POST", "/account/generate-sms-code", {
      phoneNumber: "not-a-phone",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("verification.invalidPhoneFormat");
  });
});

// ─── Verify SMS Code ──────────────────────────────────────────────────────────

describe("POST /account/verify-sms-code", () => {
  test("rejects missing code → 400", async () => {
    const res = await req("POST", "/account/verify-sms-code", {
      phoneNumber: "+85252668385",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("verification.missingCodeParams");
  });

  test("rejects missing phoneNumber → 400", async () => {
    const res = await req("POST", "/account/verify-sms-code", {
      code: "123456",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("verification.invalidPhoneFormat");
  });

  test("rejects invalid phone format → 400", async () => {
    const res = await req("POST", "/account/verify-sms-code", {
      phoneNumber: "not-a-phone",
      code: "123456",
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("verification.invalidPhoneFormat");
  });

  // test("rejects wrong code → 400", async () => {
  //   // Requires a pending verification from generate-sms-code test above
  //   const res = await req("POST", "/account/verify-sms-code", {
  //     phoneNumber: "+85252668385",
  //     code: "000000",
  //   });
  //   expect(res.status).toBe(400);
  //   expect(res.body.errorKey).toBe("verification.codeIncorrect");
  // });
});

// ─── Security ────────────────────────────────────────────────────────────────

describe("Security", () => {
  // ── JWT tampering ──────────────────────────────────────────────────────────

  test("tampered JWT signature → 401", async () => {
    const [header, payload] = (state.token || "x.x.x").split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    const res = await req("GET", `/account/${state.userId}`, undefined, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("JWT with wrong algorithm (none) → 401", async () => {
    // Simulate alg:none attack — header says no signature needed
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: state.userId, role: "user" })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;
    const res = await req("GET", `/account/${state.userId}`, undefined, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("completely arbitrary string as Bearer token → 401", async () => {
    const res = await req("GET", `/account/${state.userId}`, undefined, {
      Authorization: "Bearer thisisnotavalidtoken",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  // ── Self-access enforcement (all protected routes) ─────────────────────────

  test("PUT /account with another user's userId → 403", async () => {
    const res = await req("PUT", "/account", {
      userId: "000000000000000000000000",
      firstName: "Hacker",
    }, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("PUT /account/update-password with another user's userId → 403", async () => {
    const res = await req("PUT", "/account/update-password", {
      userId: "000000000000000000000000",
      oldPassword: "Test1234!",
      newPassword: "NewPass123!",
    }, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("POST /account/update-image with another user's userId → 403", async () => {
    const res = await req("POST", "/account/update-image", {
      userId: "000000000000000000000000",
      image: "https://example.com/img.jpg",
    }, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("POST /account/delete-user-with-email with another user's email → 403", async () => {
    const res = await req("POST", "/account/delete-user-with-email", {
      email: "someoneelse@test.com",
    }, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("PUT /account rejects email already used by NGO account → 409", async () => {
    const res = await req("PUT", "/account", {
      userId: state.userId,
      email: state.ngoEmail,
    }, auth());
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("others.emailExists");
  });

  // ── Mass assignment prevention ─────────────────────────────────────────────

  test("PUT /account strips unknown fields — role upgrade attempt ignored", async () => {
    // Zod schema for userUpdateDetailsSchema does not include role/password/credit
    // Extra fields are stripped; request still succeeds (200) with no privilege change
    const res = await req("PUT", "/account", {
      userId: state.userId,
      role: "admin",
      password: "hacked",
      credit: 999999,
      firstName: "Legit",
    }, auth());
    // Should succeed (Zod strips unknown fields) — not 400
    expect(res.status).toBe(200);
    // Returned user must not have been promoted
    expect(res.body?.user?.role).not.toBe("admin");
    expect(res.body?.user?.credit).not.toBe(999999);
  });

  // ── editNgo: body userId is ignored, JWT identity enforced ─────────────────

  test("PUT /account/edit-ngo ignores userId in body — uses JWT identity", async () => {
    // Pass a completely fake userId in userProfile; should succeed (not 400/403)
    // because userId is stripped by Zod and the JWT userId is used internally
    const res = await req("PUT", `/account/edit-ngo/${state.ngoId}`, {
      userProfile: { userId: "000000000000000000000000", firstName: "Injected" },
      ngoProfile: { description: "Security test" },
    }, ngoAuth());
    expect(res.status).toBe(200);
  });

  test("PUT /account/edit-ngo ignores deleted in body", async () => {
    const res = await req("PUT", `/account/edit-ngo/${state.ngoId}`, {
      userProfile: { deleted: true },
      ngoProfile: { description: "Deleted flag ignored" },
    }, ngoAuth());
    expect(res.status).toBe(200);
    expect(res.body?.updated).not.toContain("userProfile");
  });

  // ── NoSQL injection prevention ─────────────────────────────────────────────

  test("login with NoSQL injection operator in email field → 400", async () => {
    const res = await req("POST", "/account/login", {
      email: { $gt: "" },
      password: "anything",
    });
    // Zod requires email to be a string — object fails validation → 400
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("emailLogin.invalidEmailFormat");
  });

  test("login with NoSQL injection in password field → 400 or 401", async () => {
    const res = await req("POST", "/account/login", {
      email: "test@test.com",
      password: { $gt: "" },
    });
    expect([400, 401]).toContain(res.status);
    expect(res.body.errorKey).toBeDefined();
  });
});

// ─── Delete User (last — cleans up test data) ────────────────────────────────

describe("DELETE /account/{userId}", () => {
  test("returns 403 for a different userId (self-access enforced)", async () => {
    const res = await req("DELETE", "/account/000000000000000000000000", undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects invalid userId format → 403 (self-access fires before format check)", async () => {
    // guard.js validates self-access before ObjectId format; a mismatched path param
    // that cannot equal the JWT userId will always fail the identity check first.
    const res = await req("DELETE", "/account/not-a-valid-id", undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("deletes the test user", async () => {
    const res = await req("DELETE", `/account/${state.userId}`, undefined, auth());
    expect(res.status).toBe(200);
  });

  test("deletes the NGO test user", async () => {
    const res = await req("DELETE", `/account/${state.ngoUserId}`, undefined, ngoAuth());
    expect(res.status).toBe(200);
  });

  test("deleted user token can no longer fetch profile → 404", async () => {
    const res = await req("GET", `/account/${state.userId}`, undefined, auth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("others.getUserNotFound");
  });

  test("deleted user cannot log in again → 401", async () => {
    const res = await req("POST", "/account/login", {
      email: state.email,
      password: state.password,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("emailLogin.invalidUserCredential");
  });

  test("second delete on already deleted user returns 404", async () => {
    const res = await req("DELETE", `/account/${state.userId}`, undefined, auth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("others.getUserNotFound");
  });
});
