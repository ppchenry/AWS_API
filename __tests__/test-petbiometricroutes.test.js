/**
 * PetBiometricRoutes Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --runTestsByPath __tests__/test-petbiometricroutes.test.js
 *
 * References:
 * - __tests__/test-userroutes.test.js for shared integration-test structure.
 * - dev_docs/test_reports/USERROUTES_TEST_REPORT.md for response-shape,
 *   auth, ownership, and error-key assertion expectations.
 */

const jwt = require("../functions/PetBiometricRoutes/node_modules/jsonwebtoken");
const envConfig = require("../env.json");
const { routeRequest } = require("../functions/PetBiometricRoutes/src/router");

jest.setTimeout(60000);

const BASE_URL = process.env.PET_BIOMETRIC_BASE_URL || "http://localhost:3000";
const TEST_TS = Date.now();
const PB_ENV = envConfig.PetBiometricRoutesFunction || envConfig.PetBiometricRoutes || {};
const JWT_SECRET = PB_ENV.JWT_SECRET;
const MONGODB_URI = PB_ENV.MONGODB_URI || "";
const BUSINESS_MONGODB_URI = PB_ENV.BUSINESS_MONGODB_URI || "";
const VALID_ORIGIN = (PB_ENV.ALLOWED_ORIGINS || "http://localhost:3000").split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";
const NONEXISTENT_OBJECT_ID = "000000000000000000000001";

let mongoose;
let mainConnection;
let businessConnection;
let mainDbReady = false;
let businessDbReady = false;
let mainConnectAttempted = false;
let businessConnectAttempted = false;
let appSeedAttempted = false;
let businessSeedAttempted = false;

const state = {
  ownerUserId: null,
  ownerEmail: `petbio_owner_${TEST_TS}@test.com`,
  ownerToken: null,
  strangerUserId: null,
  strangerEmail: `petbio_stranger_${TEST_TS}@test.com`,
  strangerToken: null,
  registerPetId: null,
  registeredPetId: null,
  unregisteredPetId: null,
  deletedPetId: null,
  businessAccessSecret: `petbio_access_${TEST_TS}`,
  businessSecretKey: `petbio_secret_${TEST_TS}`,
};

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeout,
  ]);
}

async function connectDB() {
  if (mainDbReady) return;
  if (mainConnectAttempted) return;
  mainConnectAttempted = true;

  require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
  mongoose = require("mongoose");

  mainConnection = mongoose.createConnection(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    maxPoolSize: 1,
  });

  await withTimeout(mainConnection.asPromise(), 10000, "Primary MongoDB connection timed out");
  mainDbReady = true;
}

async function connectBusinessDB() {
  if (businessDbReady) return;
  if (businessConnectAttempted) return;
  businessConnectAttempted = true;

  require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
  mongoose = mongoose || require("mongoose");

  businessConnection = mongoose.createConnection(BUSINESS_MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    maxPoolSize: 1,
  });

  try {
    await withTimeout(businessConnection.asPromise(), 10000, "Business MongoDB connection timed out");
    businessDbReady = true;
  } catch (error) {
    try { businessConnection.destroy(); } catch { /* noop */ }
    businessConnection = null;
    businessDbReady = false;
  }
}

function usersCol() {
  return mainConnection.db.collection("users");
}

function petsCol() {
  return mainConnection.db.collection("pets");
}

function petFacialImagesCol() {
  return mainConnection.db.collection("pets_facial_image");
}

function rateLimitsCol() {
  return mainConnection.db.collection("rate_limits");
}

function apiLogsCol() {
  return mainConnection.db.collection("api_log");
}

function businessUsersCol() {
  return businessConnection.db.collection("users");
}

function toWindowStart(windowSec, nowMs = Date.now()) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

async function seedRateLimit({ action, identifier, limit, windowSec, ip }) {
  const windowStart = toWindowStart(windowSec);
  const expireAt = new Date(windowStart.getTime() + windowSec * 1000 * 2);
  const key = `${ip}:${identifier}`;

  await rateLimitsCol().updateOne(
    { action, key, windowStart },
    {
      $set: {
        action,
        key,
        windowStart,
        expireAt,
        count: limit,
      },
    },
    { upsert: true }
  );

  return { ip, key };
}

function makeToken(payload = {}, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...options });
}

function ownerAuth() {
  return state.ownerToken ? { Authorization: `Bearer ${state.ownerToken}` } : {};
}

function strangerAuth() {
  return state.strangerToken ? { Authorization: `Bearer ${state.strangerToken}` } : {};
}

function expiredAuth() {
  return {
    Authorization: `Bearer ${makeToken({ userId: state.ownerUserId || NONEXISTENT_OBJECT_ID }, { expiresIn: -60 })}`,
  };
}

function registerPayload(petId, overrides = {}) {
  return {
    petId,
    faceFrontArray: ["https://example.com/face-front.jpg"],
    faceLeftArray: ["https://example.com/face-left.jpg"],
    faceRightArray: ["https://example.com/face-right.jpg"],
    faceUpperArray: ["https://example.com/face-upper.jpg"],
    faceLowerArray: ["https://example.com/face-lower.jpg"],
    noseFrontArray: ["https://example.com/nose-front.jpg"],
    noseLeftArray: [],
    noseRightArray: [],
    noseUpperArray: [],
    noseLowerArray: [],
    ...overrides,
  };
}

function verifyPayload(petId, overrides = {}) {
  return {
    petId,
    access_secret: state.businessAccessSecret,
    secret_key: state.businessSecretKey,
    image_url: "https://example.com/candidate.jpg",
    animalType: "dog",
    ...overrides,
  };
}

function baseHeaders(headers = {}) {
  return {
    "Content-Type": "application/json",
    Origin: VALID_ORIGIN,
    ...headers,
  };
}

async function req(method, path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: baseHeaders(headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

async function rawReq(method, path, rawBody, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: baseHeaders(headers),
    body: rawBody,
  });

  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

async function ensureSeedData() {
  await connectDB();
  if (appSeedAttempted) return;
  appSeedAttempted = true;

  const now = new Date();
  const nowPlus = (ms) => new Date(now.getTime() + ms);
  state.ownerUserId = new mongoose.Types.ObjectId().toString();
  state.strangerUserId = new mongoose.Types.ObjectId().toString();
  state.registerPetId = new mongoose.Types.ObjectId().toString();
  state.registeredPetId = new mongoose.Types.ObjectId().toString();
  state.unregisteredPetId = new mongoose.Types.ObjectId().toString();
  state.deletedPetId = new mongoose.Types.ObjectId().toString();
  state.ownerToken = makeToken({ userId: state.ownerUserId, userEmail: state.ownerEmail, userRole: "user" });
  state.strangerToken = makeToken({ userId: state.strangerUserId, userEmail: state.strangerEmail, userRole: "user" });

  await petFacialImagesCol().deleteMany({
    petId: {
      $in: [state.registerPetId, state.registeredPetId, state.unregisteredPetId, state.deletedPetId]
        .map((id) => new mongoose.Types.ObjectId(id)),
    },
  });
  await petsCol().deleteMany({
    _id: {
      $in: [state.registerPetId, state.registeredPetId, state.unregisteredPetId, state.deletedPetId]
        .map((id) => new mongoose.Types.ObjectId(id)),
    },
  });
  await usersCol().deleteMany({
    email: { $in: [state.ownerEmail, state.strangerEmail] },
  });

  await usersCol().insertMany([
    {
      _id: new mongoose.Types.ObjectId(state.ownerUserId),
      firstName: "PetBio",
      lastName: "Owner",
      email: state.ownerEmail,
      password: "$2b$10$placeholder_not_used_for_jwt_auth",
      role: "user",
      verified: true,
      subscribe: false,
      promotion: false,
      deleted: false,
      createdAt: nowPlus(1),
      updatedAt: nowPlus(1),
    },
    {
      _id: new mongoose.Types.ObjectId(state.strangerUserId),
      firstName: "PetBio",
      lastName: "Stranger",
      email: state.strangerEmail,
      password: "$2b$10$placeholder_not_used_for_jwt_auth",
      role: "user",
      verified: true,
      subscribe: false,
      promotion: false,
      deleted: false,
      createdAt: nowPlus(2),
      updatedAt: nowPlus(2),
    },
  ]);

  const petDocs = [
    {
      _id: new mongoose.Types.ObjectId(state.registerPetId),
      userId: new mongoose.Types.ObjectId(state.ownerUserId),
      name: "Register Pet",
      birthday: new Date("2020-01-01T00:00:00.000Z"),
      sex: "M",
      animal: "dog",
      breed: "Shiba Inu",
      isRegistered: false,
      deleted: false,
      createdAt: nowPlus(10),
      updatedAt: nowPlus(10),
    },
    {
      _id: new mongoose.Types.ObjectId(state.registeredPetId),
      userId: new mongoose.Types.ObjectId(state.ownerUserId),
      name: "Registered Pet",
      birthday: new Date("2020-01-02T00:00:00.000Z"),
      sex: "F",
      animal: "dog",
      breed: "Mixed",
      isRegistered: true,
      deleted: false,
      createdAt: nowPlus(20),
      updatedAt: nowPlus(20),
    },
    {
      _id: new mongoose.Types.ObjectId(state.unregisteredPetId),
      userId: new mongoose.Types.ObjectId(state.ownerUserId),
      name: "Unregistered Pet",
      birthday: new Date("2020-01-03T00:00:00.000Z"),
      sex: "M",
      animal: "dog",
      breed: "Mixed",
      isRegistered: false,
      deleted: false,
      createdAt: nowPlus(30),
      updatedAt: nowPlus(30),
    },
    {
      _id: new mongoose.Types.ObjectId(state.deletedPetId),
      userId: new mongoose.Types.ObjectId(state.ownerUserId),
      name: "Deleted Pet",
      birthday: new Date("2020-01-04T00:00:00.000Z"),
      sex: "F",
      animal: "dog",
      breed: "Mixed",
      isRegistered: false,
      deleted: true,
      createdAt: nowPlus(40),
      updatedAt: nowPlus(40),
    },
  ];
  await petsCol().insertMany(petDocs);

  await petFacialImagesCol().insertOne({
    petId: new mongoose.Types.ObjectId(state.registeredPetId),
    FaceImage: {
      FaceFront: ["https://example.com/seed-face-front.jpg"],
      FaceLeft: ["https://example.com/seed-face-left.jpg"],
      FaceRight: ["https://example.com/seed-face-right.jpg"],
      FaceUpper: ["https://example.com/seed-face-upper.jpg"],
      FaceLower: ["https://example.com/seed-face-lower.jpg"],
    },
    NoseImage: {
      NoseFront: ["https://example.com/seed-nose-front.jpg"],
      NoseLeft: [],
      NoseRight: [],
      NoseUpper: [],
      NoseLower: [],
    },
    RegisteredFrom: "seeded-test",
    createdAt: nowPlus(50),
    updatedAt: nowPlus(50),
  }, { upsert: true });

  const seededUnregistered = await petsCol().findOne({ _id: new mongoose.Types.ObjectId(state.unregisteredPetId) });
  const seededRegistered = await petsCol().findOne({ _id: new mongoose.Types.ObjectId(state.registeredPetId) });
  if (!seededUnregistered || !seededRegistered) {
    throw new Error("Failed to seed pet test fixtures");
  }
}

async function ensureBusinessSeedData() {
  await connectBusinessDB();
  if (!businessDbReady) return false;
  if (businessSeedAttempted) return true;
  businessSeedAttempted = true;

  const now = new Date();
  await businessUsersCol().deleteMany({ access_key: state.businessAccessSecret });

  await businessUsersCol().insertOne({
    business_name: "Pet pet club",
    access_key: state.businessAccessSecret,
    access_secret: state.businessSecretKey,
    createdAt: now,
    updatedAt: now,
  });

  return true;
}

const dbTest = MONGODB_URI
  ? (name, fn, timeout) => test(name, async () => {
      await ensureSeedData();
      await fn();
    }, timeout)
  : test.skip;

const businessDbTest = BUSINESS_MONGODB_URI
  ? (name, fn, timeout) => test(name, async () => {
      await ensureSeedData();
      const businessReady = await ensureBusinessSeedData();
      if (!businessReady) {
        console.log(`[skip] ${name} - business DB connection unavailable`);
        return;
      }
      await fn();
    }, timeout)
  : test.skip;

afterAll(async () => {
  if (mainDbReady) {
    try {
      if (state.ownerUserId || state.strangerUserId) {
        await apiLogsCol().deleteMany({
          userId: {
            $in: [state.ownerUserId, state.strangerUserId]
              .filter(Boolean)
              .map((id) => new mongoose.Types.ObjectId(id)),
          },
        });
      }

      await rateLimitsCol().deleteMany({
        key: { $regex: /^203\.0\.113\./ },
      });

      await petFacialImagesCol().deleteMany({
        petId: {
          $in: [state.registerPetId, state.registeredPetId, state.unregisteredPetId, state.deletedPetId]
            .filter(Boolean)
            .map((id) => new mongoose.Types.ObjectId(id)),
        },
      });

      await petsCol().deleteMany({
        _id: {
          $in: [state.registerPetId, state.registeredPetId, state.unregisteredPetId, state.deletedPetId]
            .filter(Boolean)
            .map((id) => new mongoose.Types.ObjectId(id)),
        },
      });

      await usersCol().deleteMany({
        email: { $in: [state.ownerEmail, state.strangerEmail] },
      });

    } catch {
      // best-effort cleanup
    }

    try { await mainConnection.close(); } catch { /* noop */ }
  }

  if (businessDbReady && businessConnection) {
    try {
      await businessUsersCol().deleteMany({ access_key: state.businessAccessSecret });
    } catch {
      // best-effort cleanup
    }

    try { await businessConnection.close(); } catch { /* noop */ }
  }
});

describe("OPTIONS preflight", () => {
  test.each([
    "/petBiometrics/register",
    "/petBiometrics/verifyPet",
    `/petBiometrics/${NONEXISTENT_OBJECT_ID}`,
  ])("OPTIONS %s returns 204 for an allowed origin", async (path) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(`${BASE_URL}/petBiometrics/register`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });

    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(`${BASE_URL}/petBiometrics/register`, {
      method: "OPTIONS",
    });

    expect(res.status).toBe(403);
  });
});

describe("JWT authentication", () => {
  const path = "/petBiometrics/register";
  const body = registerPayload(NONEXISTENT_OBJECT_ID);

  test("rejects request with no Authorization header -> 401", async () => {
    const res = await req("POST", path, body);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT -> 401", async () => {
    const res = await req("POST", path, body, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Bearer token -> 401", async () => {
    const res = await req("POST", path, body, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects token without Bearer prefix -> 401", async () => {
    const token = makeToken({ userId: NONEXISTENT_OBJECT_ID });
    const res = await req("POST", path, body, { Authorization: token });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects tampered JWT signature -> 401", async () => {
    const token = makeToken({ userId: NONEXISTENT_OBJECT_ID });
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    const res = await req("POST", path, body, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects alg:none token -> 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: NONEXISTENT_OBJECT_ID })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;
    const res = await req("POST", path, body, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("error response shape includes success, errorKey, error, requestId", async () => {
    const res = await req("POST", path, body);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(typeof res.body.requestId).toBe("string");
  });

  test("CORS headers are present on auth errors for allowed origins", async () => {
    const res = await req("POST", path, body);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

describe("Dead routes return 405", () => {
  test.each([
    ["PUT", "/petBiometrics/register"],
    ["DELETE", "/petBiometrics/{petId}"],
    ["POST", "/petBiometrics/{petId}"],
  ])("%s %s -> 405", async (method, resource) => {
    const response = await routeRequest({
      event: {
        httpMethod: method,
        resource,
        path: resource,
        headers: { Origin: VALID_ORIGIN },
      },
    });

    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
  });
});

describe("Guard and validation", () => {
  test("GET rejects invalid petId format -> 400", async () => {
    const token = makeToken({ userId: NONEXISTENT_OBJECT_ID });
    const res = await req("GET", "/petBiometrics/not-a-valid-id", undefined, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBiometric.invalidPetId");
  });

  test("register rejects malformed JSON -> 400", async () => {
    const token = makeToken({ userId: NONEXISTENT_OBJECT_ID });
    const res = await rawReq("POST", "/petBiometrics/register", '{"petId":"broken"', { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  dbTest("register rejects empty body -> 400", async () => {
    const res = await req("POST", "/petBiometrics/register", {}, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  dbTest("register rejects body userId mismatch -> 403", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/register",
      registerPayload(state.registerPetId, { userId: state.strangerUserId }),
      ownerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("petBiometric.forbidden");
  });

  dbTest("register rejects invalid image URL -> 400", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/register",
      registerPayload(state.registerPetId, { faceFrontArray: ["not-a-url"] }),
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBiometric.invalidImageUrl");
  });

  businessDbTest("verify rejects empty body -> 400", async () => {
    const res = await req("POST", "/petBiometrics/verifyPet", {}, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  businessDbTest("verify rejects body userId mismatch -> 403", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/verifyPet",
      verifyPayload(state.registeredPetId, { userId: state.strangerUserId }),
      ownerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("petBiometric.forbidden");
  });

  businessDbTest("verify rejects invalid image URL -> 400", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/verifyPet",
      verifyPayload(state.registeredPetId, { image_url: "not-a-url" }),
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBiometric.invalidImageUrl");
  });
});

describe("GET /petBiometrics/{petId}", () => {
  dbTest("owner retrieves registered biometric data -> 200", async () => {
    const res = await req("GET", `/petBiometrics/${state.registeredPetId}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.petId).toBe(state.registeredPetId);
    expect(Array.isArray(res.body.faceImages.faceFrontUrls)).toBe(true);
    expect(res.body.faceImages.faceFrontUrls.length).toBeGreaterThan(0);
  });

  dbTest("stranger gets exact 403 on owner pet -> forbidden", async () => {
    const res = await req("GET", `/petBiometrics/${state.registeredPetId}`, undefined, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("petBiometric.forbidden");
  });

  dbTest("nonexistent pet returns 404 petNotFound", async () => {
    const res = await req("GET", `/petBiometrics/${NONEXISTENT_OBJECT_ID}`, undefined, ownerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petBiometric.petNotFound");
  });

  dbTest("unregistered pet returns 404 notRegistered", async () => {
    const res = await req("GET", `/petBiometrics/${state.unregisteredPetId}`, undefined, ownerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petBiometric.notRegistered");
  });
});

describe("POST /petBiometrics/register", () => {
  dbTest("owner creates biometric profile -> 201", async () => {
    const res = await req("POST", "/petBiometrics/register", registerPayload(state.registerPetId), ownerAuth());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.result.petId).toBe(state.registerPetId);
    expect(res.body.result.operation).toBe("created");
    expect(res.body.result.isRegistered).toBe(true);

    const storedImages = await petFacialImagesCol().findOne({ petId: new mongoose.Types.ObjectId(state.registerPetId) });
    const storedPet = await petsCol().findOne({ _id: new mongoose.Types.ObjectId(state.registerPetId) });
    expect(storedImages).toBeTruthy();
    expect(storedPet?.isRegistered).toBe(true);
  });

  dbTest("owner updates existing biometric profile -> 200", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/register",
      registerPayload(state.registerPetId, { faceFrontArray: ["https://example.com/face-front-updated.jpg"] }),
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.result.operation).toBe("updated");

    const storedImages = await petFacialImagesCol().findOne({ petId: new mongoose.Types.ObjectId(state.registerPetId) });
    expect(storedImages.FaceImage.FaceFront).toEqual(["https://example.com/face-front-updated.jpg"]);
  });

  dbTest("stranger gets exact 403 on register -> forbidden", async () => {
    const res = await req("POST", "/petBiometrics/register", registerPayload(state.registerPetId), strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("petBiometric.forbidden");
  });

  dbTest("deleted pet returns 404 petNotFound", async () => {
    const res = await req("POST", "/petBiometrics/register", registerPayload(state.deletedPetId), ownerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petBiometric.petNotFound");
  });

  dbTest("rate limits register flow -> 429", async () => {
    const { ip } = await seedRateLimit({
      action: "petBiometricRegister",
      identifier: state.ownerUserId,
      limit: 10,
      windowSec: 300,
      ip: "203.0.113.10",
    });

    const res = await req(
      "POST",
      "/petBiometrics/register",
      registerPayload(state.registerPetId),
      {
        ...ownerAuth(),
        "X-Forwarded-For": ip,
      }
    );
    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("others.rateLimited");
  });
});

describe("POST /petBiometrics/verifyPet", () => {
  dbTest("nonexistent pet returns 404 petNotFound", async () => {
    const res = await req("POST", "/petBiometrics/verifyPet", verifyPayload(NONEXISTENT_OBJECT_ID), ownerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petBiometric.petNotFound");
  });

  dbTest("stranger gets exact 403 on verify -> forbidden", async () => {
    const res = await req("POST", "/petBiometrics/verifyPet", verifyPayload(state.registeredPetId), strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("petBiometric.forbidden");
  });

  dbTest("unregistered pet returns 404 notRegistered", async () => {
    const res = await req("POST", "/petBiometrics/verifyPet", verifyPayload(state.unregisteredPetId), ownerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petBiometric.notRegistered");
  });

  businessDbTest("invalid business credentials return 400", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/verifyPet",
      verifyPayload(state.registeredPetId, {
        access_secret: "wrong-access",
        secret_key: "wrong-secret",
      }),
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBiometric.invalidCredentials");
  });

  businessDbTest("missing image input returns 400", async () => {
    const body = verifyPayload(state.registeredPetId);
    delete body.image_url;

    const res = await req("POST", "/petBiometrics/verifyPet", body, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBiometric.errors.imageRequired");
  });

  businessDbTest("unsupported inline file returns 400", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/verifyPet",
      verifyPayload(state.registeredPetId, {
        image_url: undefined,
        files: [
          {
            filename: "test.txt",
            contentType: "image/jpeg",
            content: Buffer.from("not-an-image", "utf8").toString("base64"),
          },
        ],
      }),
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBiometric.unsupportedFormat");
  });

  businessDbTest("zero-byte inline file returns 413", async () => {
    const res = await req(
      "POST",
      "/petBiometrics/verifyPet",
      verifyPayload(state.registeredPetId, {
        image_url: undefined,
        files: [
          {
            filename: "empty.jpg",
            contentType: "image/jpeg",
            content: "",
          },
        ],
      }),
      ownerAuth()
    );
    expect(res.status).toBe(413);
    expect(res.body.errorKey).toBe("petBiometric.fileTooSmall");
  });

  businessDbTest("rate limits verify flow -> 429", async () => {
    const { ip } = await seedRateLimit({
      action: "petBiometricVerify",
      identifier: state.ownerUserId,
      limit: 10,
      windowSec: 300,
      ip: "203.0.113.11",
    });

    const res = await req(
      "POST",
      "/petBiometrics/verifyPet",
      verifyPayload(state.registeredPetId),
      {
        ...ownerAuth(),
        "X-Forwarded-For": ip,
      }
    );
    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("others.rateLimited");
  });
});
