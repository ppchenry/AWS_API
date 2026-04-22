/**
 * CreatePetBasicInfo integration tests.
 * Invokes the Lambda handler directly — no SAM required.
 * Run with: npm test -- --runTestsByPath __tests__/test-createpetbasicinfo-unit.test.js
 *
 * Required env.json keys under CreatePetBasicInfoFunction:
 *   JWT_SECRET, JWT_BYPASS, ALLOWED_ORIGINS, MONGODB_URI
 *
 * Optional fixture keys (DB-backed tests skip if absent):
 *   TEST_OWNER_USER_ID - userId of a live non-deleted user in the UAT database
 */

const jwt = require("../functions/CreatePetBasicInfo/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

const config = envConfig.CreatePetBasicInfoFunction || {};
const JWT_SECRET = config.JWT_SECRET || "";
const MONGODB_URI = config.MONGODB_URI || "";
const VALID_ORIGIN = (config.ALLOWED_ORIGINS || "http://localhost:3000").split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

const TEST_OWNER_USER_ID =
  config.TEST_OWNER_USER_ID ||
  envConfig.PetVaccineRecordsFunction?.TEST_OWNER_USER_ID ||
  envConfig.PetBasicInfoFunction?.TEST_OWNER_USER_ID ||
  "";

const STRANGER_USER_ID = "000000000000000000000099";

let mongoose;
let dbReady = false;
let connectAttempted = false;
let handler;

const cleanupState = { petIds: new Set(), rateLimitKeys: new Set() };

async function connectDB() {
  if (dbReady || connectAttempted || !MONGODB_URI) return;
  connectAttempted = true;
  try {
    require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
    mongoose = require("mongoose");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000, maxPoolSize: 1 });
    }
    dbReady = true;
  } catch (err) {
    console.warn("[test] MongoDB unavailable - DB-backed CreatePetBasicInfo checks will be skipped:", err.message);
  }
}

async function disconnectDB() {
  if (mongoose && mongoose.connection.readyState !== 0) await mongoose.disconnect();
  dbReady = false;
}

const dbTest =
  MONGODB_URI && TEST_OWNER_USER_ID
    ? (name, fn) =>
        test(name, async () => {
          await connectDB();
          if (!dbReady) {
            console.log(`[skip] ${name} - no DB connection`);
            return;
          }
          const owner = await mongoose.connection.db.collection("users").findOne({
            _id: new mongoose.Types.ObjectId(TEST_OWNER_USER_ID),
            deleted: { $ne: true },
          });
          if (!owner) {
            console.log(`[skip] ${name} - owner fixture not found`);
            return;
          }
          await fn();
        })
    : test.skip;

function loadHandler() {
  if (handler) return handler;
  require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_BYPASS = config.JWT_BYPASS || "false";
  process.env.MONGODB_URI = MONGODB_URI;
  process.env.ALLOWED_ORIGINS = config.ALLOWED_ORIGINS || VALID_ORIGIN;
  jest.resetModules();
  handler = require("../functions/CreatePetBasicInfo").handler;
  return handler;
}

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      userId: TEST_OWNER_USER_ID || STRANGER_USER_ID,
      userEmail: "createpet-test@example.com",
      userRole: "user",
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function makeEvent({ body, ipAddress = "198.51.100.1", token, origin = VALID_ORIGIN, method = "POST" } = {}) {
  return {
    httpMethod: method,
    resource: "/pets/create-pet-basic-info",
    headers: {
      Authorization: token !== null ? (token ? `Bearer ${token}` : undefined) : undefined,
      Origin: origin,
      "x-forwarded-for": ipAddress,
    },
    body,
    cookies: null,
    queryStringParameters: { lang: "en" },
    requestContext: { identity: { sourceIp: ipAddress } },
  };
}

function makeContext(id = "ctx-1") {
  return { awsRequestId: id, callbackWaitsForEmptyEventLoop: true };
}

async function cleanupArtifacts() {
  if (!dbReady) {
    cleanupState.petIds.clear();
    cleanupState.rateLimitKeys.clear();
    return;
  }
  if (cleanupState.petIds.size > 0) {
    await mongoose.connection.db.collection("pets").deleteMany({
      _id: { $in: Array.from(cleanupState.petIds, (id) => new mongoose.Types.ObjectId(id)) },
    });
  }
  if (cleanupState.rateLimitKeys.size > 0) {
    await mongoose.connection.db.collection("rate_limits").deleteMany({
      action: "createPetBasicInfo",
      key: { $in: Array.from(cleanupState.rateLimitKeys) },
    });
  }
  cleanupState.petIds.clear();
  cleanupState.rateLimitKeys.clear();
}

afterEach(async () => { await cleanupArtifacts(); });
afterAll(async () => { await cleanupArtifacts(); await disconnectDB(); });

// ─── OPTIONS preflight ────────────────────────────────────────────────────────

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for allowed origin", async () => {
    const response = await loadHandler()(makeEvent({ method: "OPTIONS" }), makeContext("opts-1"));
    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe(VALID_ORIGIN);
    expect(response.headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  test("returns 403 for disallowed origin", async () => {
    const response = await loadHandler()(
      makeEvent({ method: "OPTIONS", origin: DISALLOWED_ORIGIN }),
      makeContext("opts-2")
    );
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).errorKey).toBe("common.originNotAllowed");
  });
});

// ─── JWT authentication ───────────────────────────────────────────────────────

describe("JWT authentication", () => {
  test("rejects request with no Authorization header → 401", async () => {
    const response = await loadHandler()(
      makeEvent({ body: JSON.stringify({ name: "Test" }), token: null }),
      makeContext("auth-1")
    );
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).errorKey).toBe("common.unauthorized");
  });

  test("rejects expired JWT → 401", async () => {
    const token = jwt.sign({ userId: STRANGER_USER_ID }, JWT_SECRET, { expiresIn: -60 });
    const response = await loadHandler()(
      makeEvent({ body: JSON.stringify({ name: "Test" }), token }),
      makeContext("auth-2")
    );
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).errorKey).toBe("common.unauthorized");
  });

  test("rejects tampered JWT signature → 401", async () => {
    const validToken = makeToken();
    const [h, p] = validToken.split(".");
    const response = await loadHandler()(
      makeEvent({ body: JSON.stringify({ name: "Test" }), token: `${h}.${p}.tampered` }),
      makeContext("auth-3")
    );
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).errorKey).toBe("common.unauthorized");
  });

  test("rejects alg:none JWT → 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: STRANGER_USER_ID })).toString("base64url");
    const response = await loadHandler()(
      makeEvent({ body: JSON.stringify({ name: "Test" }), token: `${fakeHeader}.${fakePayload}.` }),
      makeContext("auth-4")
    );
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).errorKey).toBe("common.unauthorized");
  });

  test("error shape includes success:false, errorKey, and requestId", async () => {
    const response = await loadHandler()(
      makeEvent({ body: JSON.stringify({ name: "Test" }), token: null }),
      makeContext("auth-shape-1")
    );
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("common.unauthorized");
    expect(typeof body.error).toBe("string");
    expect(typeof body.requestId).toBe("string");
  });
});

// ─── Guard validation ─────────────────────────────────────────────────────────

describe("Guard validation", () => {
  test("rejects malformed JSON body → 400", async () => {
    const response = await loadHandler()(
      makeEvent({ body: "{broken", token: makeToken() }),
      makeContext("guard-1")
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("common.invalidJSON");
  });

  test("rejects empty POST body → 400", async () => {
    const response = await loadHandler()(
      makeEvent({ body: "{}", token: makeToken() }),
      makeContext("guard-2")
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("common.missingParams");
  });
});

// ─── Method enforcement ───────────────────────────────────────────────────────

describe("Method enforcement", () => {
  test("returns 405 for GET on create-pet-basic-info route", async () => {
    const response = await loadHandler()(
      makeEvent({ method: "GET", token: makeToken() }),
      makeContext("method-1")
    );
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("common.methodNotAllowed");
  });

  test("returns 405 for DELETE on create-pet-basic-info route", async () => {
    const response = await loadHandler()(
      makeEvent({ method: "DELETE", token: makeToken() }),
      makeContext("method-2")
    );
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("common.methodNotAllowed");
  });
});

// ─── Schema validation ────────────────────────────────────────────────────────

describe("Schema validation — unknown field rejection", () => {
  test("rejects body containing userId field → 400 unknownField", async () => {
    const response = await loadHandler()(
      makeEvent({
        body: JSON.stringify({ name: "Test", userId: STRANGER_USER_ID }),
        token: makeToken(),
      }),
      makeContext("schema-1")
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("createPetBasicInfo.errors.unknownField");
  });

  test("rejects body containing ngoId field → 400 unknownField", async () => {
    const response = await loadHandler()(
      makeEvent({
        body: JSON.stringify({ name: "Test", ngoId: "000000000000000000000001" }),
        token: makeToken(),
      }),
      makeContext("schema-2")
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("createPetBasicInfo.errors.unknownField");
  });

  test("rejects NoSQL injection object in name field → 400", async () => {
    const response = await loadHandler()(
      makeEvent({
        body: JSON.stringify({ name: { $gt: "" } }),
        token: makeToken(),
      }),
      makeContext("schema-3")
    );
    expect(response.statusCode).toBe(400);
    expect(typeof JSON.parse(response.body).errorKey).toBe("string");
  });
});

// ─── DB-backed tests ──────────────────────────────────────────────────────────

describe("CreatePetBasicInfo DB-backed", () => {
  dbTest("creates pet in MongoDB and returns sanitized response without internal fields", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ip = "198.51.100.10";
    cleanupState.rateLimitKeys.add(`${ip}:${TEST_OWNER_USER_ID}`);

    const response = await loadHandler()(
      makeEvent({
        body: JSON.stringify({
          name: `Test Pet ${suffix}`,
          birthday: "2022-01-15",
          weight: 4.5,
          sex: "female",
          sterilization: false,
          animal: "dog",
          breed: "Shiba Inu",
          features: "fluffy tail",
          info: "playful",
          status: "active",
          tagId: `TAG-${suffix}`,
        }),
        ipAddress: ip,
        token: makeToken(),
      }),
      makeContext(`create-ok-${suffix}`)
    );

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();
    expect(body.result._id).toBeTruthy();
    expect(body.result.name).toBe(`Test Pet ${suffix}`);
    expect(body.result.tagId).toBe(`TAG-${suffix}`);

    // Ownership and internal fields must not be exposed
    expect(body.result).not.toHaveProperty("userId");
    expect(body.result).not.toHaveProperty("ngoId");
    expect(body.result).not.toHaveProperty("transferNGO");
    expect(body.result).not.toHaveProperty("createdAt");
    expect(body.result).not.toHaveProperty("updatedAt");
    expect(body.result).not.toHaveProperty("medicationRecordsCount");
    expect(body.result).not.toHaveProperty("vaccineRecordsCount");

    cleanupState.petIds.add(body.id);

    // Verify the DB record was written with the JWT caller's userId
    const pet = await mongoose.connection.db.collection("pets").findOne({
      _id: new mongoose.Types.ObjectId(body.id),
    });
    expect(pet).toBeTruthy();
    expect(String(pet.userId)).toBe(TEST_OWNER_USER_ID);
    expect(pet.medicationRecordsCount).toBe(0);
    expect(pet.vaccineRecordsCount).toBe(0);
    expect(pet.dewormRecordsCount).toBe(0);
    expect(pet.createdAt).toBeInstanceOf(Date);
  });

  dbTest("rejects client-supplied userId and does not insert pet", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ip = "198.51.100.11";
    cleanupState.rateLimitKeys.add(`${ip}:${TEST_OWNER_USER_ID}`);

    const response = await loadHandler()(
      makeEvent({
        body: JSON.stringify({ name: `Blocked ${suffix}`, userId: TEST_OWNER_USER_ID, tagId: `TAG-BLOCK-${suffix}` }),
        ipAddress: ip,
        token: makeToken(),
      }),
      makeContext(`create-userid-${suffix}`)
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("createPetBasicInfo.errors.unknownField");

    const created = await mongoose.connection.db.collection("pets").findOne({ tagId: `TAG-BLOCK-${suffix}` });
    expect(created).toBeNull();
  });

  dbTest("invalidJSON does not create a rate-limit entry", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ip = "198.51.100.12";

    const response = await loadHandler()(
      makeEvent({ body: "{", ipAddress: ip, token: makeToken() }),
      makeContext(`create-json-${suffix}`)
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("common.invalidJSON");

    const rl = await mongoose.connection.db.collection("rate_limits").findOne({
      action: "createPetBasicInfo",
      key: `${ip}:${TEST_OWNER_USER_ID}`,
    });
    expect(rl).toBeNull();
  });

  dbTest("rejects duplicate tagId → 409 duplicatePetTagId", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ip = "198.51.100.13";
    const tagId = `TAG-DUP-${suffix}`;
    cleanupState.rateLimitKeys.add(`${ip}:${TEST_OWNER_USER_ID}`);

    // First create should succeed
    const first = await loadHandler()(
      makeEvent({
        body: JSON.stringify({ name: `First Pet ${suffix}`, birthday: "2022-01-15", tagId, animal: "cat", sex: "male" }),
        ipAddress: ip,
        token: makeToken(),
      }),
      makeContext(`dup-tag-first-${suffix}`)
    );
    expect(first.statusCode).toBe(201);
    cleanupState.petIds.add(JSON.parse(first.body).id);

    // Second create with same tagId should be rejected
    const second = await loadHandler()(
      makeEvent({
        body: JSON.stringify({ name: `Second Pet ${suffix}`, birthday: "2022-01-15", tagId, animal: "dog", sex: "female" }),
        ipAddress: ip,
        token: makeToken(),
      }),
      makeContext(`dup-tag-second-${suffix}`)
    );
    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body).errorKey).toBe("createPetBasicInfo.errors.duplicatePetTagId");
  });
});
