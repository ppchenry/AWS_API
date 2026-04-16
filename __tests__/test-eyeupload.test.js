/**
 * EyeUpload Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-eyeupload
 *
 * This suite seeds real users directly into MongoDB so that
 * pet-ownership and stranger-rejection tests exercise actual DB state,
 * matching the rigour of test-userroutes.test.js.
 *
 * Env config (env.json EyeUploadFunction):
 *   TEST_PET_ID         — ObjectId of a live pet owned by TEST_OWNER_USER_ID
 *   TEST_OWNER_USER_ID  — userId that owns TEST_PET_ID
 *
 * If either is missing, fixture-backed pet tests are skipped with a warning.
 * Core auth, guard, Zod, and dead-route tests run unconditionally.
 */

const jwt = require("../functions/EyeUpload/node_modules/jsonwebtoken");
const envConfig = require("../env.json");
const { routeRequest } = require("../functions/EyeUpload/src/router");

jest.setTimeout(30000);

const BASE_URL = "http://localhost:3000";
const TEST_TS = Date.now();
const JWT_SECRET = envConfig.EyeUploadFunction.JWT_SECRET;
const MONGODB_URI = envConfig.EyeUploadFunction?.MONGODB_URI || "";
const VALID_ORIGIN = envConfig.EyeUploadFunction.ALLOWED_ORIGINS.split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

// Valid ObjectId format that will never exist in the DB
const NONEXISTENT_PET_ID = "000000000000000000000001";
const NONEXISTENT_USER_ID = "000000000000000000000099";

// Fixture config — set in env.json for full ownership coverage
const TEST_PET_ID = envConfig.EyeUploadFunction?.TEST_PET_ID || "";
const TEST_OWNER_USER_ID = envConfig.EyeUploadFunction?.TEST_OWNER_USER_ID || "";
const FIXTURE_TEST_TIMEOUT_MS = 60000;

// petTest: skipped only when no test pet is configured
const petTest = TEST_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;

// ─── MongoDB direct connection (seeds test users without UserRoutesFunction) ─

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
    console.warn("[test] MongoDB unavailable - seeded-user tests will be skipped:", err.message);
    dbReady = false;
  }
}

function usersCol() {
  return mongoose.connection.db.collection("users");
}

function rateLimitsCol() {
  return mongoose.connection.db.collection("rate_limits");
}

function toWindowStart(windowSec, nowMs = Date.now()) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

async function seedRateLimit({ action, identifier, limit, windowSec, ip = "203.0.113.10" }) {
  if (!dbReady) {
    throw new Error("MongoDB must be connected before seeding rate limits");
  }

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
    { upsert: true },
  );

  return { ip, key };
}

afterAll(async () => {
  if (dbReady && mongoose) {
    // Clean up seeded test users
    try {
      await usersCol().deleteMany({
        email: { $in: [state.ownerEmail, state.strangerEmail] },
      });
      await rateLimitsCol().deleteMany({
        key: { $regex: /^(203\.0\.113\.10|203\.0\.113\.11|203\.0\.113\.12|203\.0\.113\.13|203\.0\.113\.14|203\.0\.113\.15):/ },
      });
    } catch { /* best-effort cleanup */ }
    await mongoose.disconnect();
  }
});

// ─── Shared state (populated by direct MongoDB seeding) ──────────────────────

const state = {
  // Seeded owner — inserted into MongoDB, JWT minted with makeToken
  ownerEmail: `eyetest_owner_${TEST_TS}@test.com`,
  ownerUserId: null,
  ownerToken: null,

  // Seeded stranger — exists in DB, but does not own any pet
  strangerEmail: `eyetest_stranger_${TEST_TS}@test.com`,
  strangerUserId: null,
  strangerToken: null,

  // Pet created during the suite — proves create + update + ownership
  createdPetId: null,
};

async function ensureSeededUsers() {
  await connectDB();
  if (!dbReady) {
    throw new Error("MongoDB unavailable - cannot seed fixture users");
  }

  if (!state.ownerUserId) {
    const result = await usersCol().insertOne({
      firstName: "EyeOwner",
      lastName: "Test",
      email: state.ownerEmail,
      password: "$2b$10$placeholder_not_used_for_jwt_auth",
      role: "user",
      verified: true,
      subscribe: false,
      promotion: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    state.ownerUserId = result.insertedId.toString();
    state.ownerToken = makeToken({ userId: state.ownerUserId, userEmail: state.ownerEmail, userRole: "user" });
  }

  if (!state.strangerUserId) {
    const result = await usersCol().insertOne({
      firstName: "EyeStranger",
      lastName: "Test",
      email: state.strangerEmail,
      password: "$2b$10$placeholder_not_used_for_jwt_auth",
      role: "user",
      verified: true,
      subscribe: false,
      promotion: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    state.strangerUserId = result.insertedId.toString();
    state.strangerToken = makeToken({ userId: state.strangerUserId, userEmail: state.strangerEmail, userRole: "user" });
  }
}

// ─── Token helpers ───────────────────────────────────────────────────────────

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...opts });
}

function fixtureOwnerAuth() {
  if (!TEST_OWNER_USER_ID) return {};
  const token = makeToken({ userId: TEST_OWNER_USER_ID });
  return { Authorization: `Bearer ${token}` };
}

function seededOwnerAuth() {
  return state.ownerToken ? { Authorization: `Bearer ${state.ownerToken}` } : {};
}

function seededStrangerAuth() {
  return state.strangerToken ? { Authorization: `Bearer ${state.strangerToken}` } : {};
}

function expiredAuth() {
  const token = jwt.sign(
    { userId: TEST_OWNER_USER_ID || "expired-user" },
    JWT_SECRET,
    { expiresIn: -60 },
  );
  return { Authorization: `Bearer ${token}` };
}

function tokenAuth(payload = {}) {
  return { Authorization: `Bearer ${makeToken(payload)}` };
}

// ─── Request helpers ─────────────────────────────────────────────────────────

async function req(method, path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

async function rawReq(method, path, rawBody, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body: rawBody,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

/**
 * Build a multipart/form-data body as a Buffer.
 * `fields` — { key: value } scalar fields.
 * `files`  — [{ field, filename, contentType, content (Buffer|string) }].
 */
function buildMultipart(fields = {}, files = []) {
  const boundary = "----JestEyeUploadBoundary" + TEST_TS;
  const buffers = [];

  for (const [key, value] of Object.entries(fields)) {
    buffers.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    ));
  }

  for (const file of files) {
    const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    buffers.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ));
    buffers.push(buf);
    buffers.push(Buffer.from("\r\n"));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(buffers), boundary };
}

async function multipartReq(method, path, fields = {}, files = [], headers = {}) {
  const { body } = buildMultipart(fields, files);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": `multipart/form-data; boundary=----JestEyeUploadBoundary${TEST_TS}`,
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

/** 1×1 red JPEG — minimal valid JPEG file. */
function tinyJpeg() {
  return Buffer.from("fake-jpeg-image-content", "utf8");
}

/** 1×1 red PNG. */
function tinyPng() {
  return Buffer.from("fake-png-image-content", "utf8");
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 0 — Seed users directly into MongoDB + mint JWTs
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 0 — Seed test users via MongoDB", () => {
  test("connect to MongoDB", async () => {
    await connectDB();
    expect(dbReady).toBe(true);
  });

  test("seed owner user", async () => {
    if (!dbReady) return;
    const result = await usersCol().insertOne({
      firstName: "EyeOwner",
      lastName: "Test",
      email: state.ownerEmail,
      password: "$2b$10$placeholder_not_used_for_jwt_auth",
      role: "user",
      verified: true,
      subscribe: false,
      promotion: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    state.ownerUserId = result.insertedId.toString();
    state.ownerToken = makeToken({ userId: state.ownerUserId, userEmail: state.ownerEmail, userRole: "user" });
    expect(state.ownerUserId).toBeTruthy();
    expect(state.ownerToken).toBeTruthy();
  });

  test("seed stranger user", async () => {
    if (!dbReady) return;
    const result = await usersCol().insertOne({
      firstName: "EyeStranger",
      lastName: "Test",
      email: state.strangerEmail,
      password: "$2b$10$placeholder_not_used_for_jwt_auth",
      role: "user",
      verified: true,
      subscribe: false,
      promotion: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    state.strangerUserId = result.insertedId.toString();
    state.strangerToken = makeToken({ userId: state.strangerUserId, userEmail: state.strangerEmail, userRole: "user" });
    expect(state.strangerUserId).toBeTruthy();
    expect(state.strangerToken).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORS Preflight
// ═══════════════════════════════════════════════════════════════════════════

describe("OPTIONS preflight", () => {
  const routes = [
    "/util/uploadImage",
    "/util/uploadPetBreedImage",
    "/pets/updatePetImage",
    "/pets/create-pet-basic-info-with-image",
    `/analysis/eye-upload/${NONEXISTENT_PET_ID}`,
    "/analysis/breed",
  ];

  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(`${BASE_URL}/analysis/breed`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(`${BASE_URL}/analysis/breed`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(`${BASE_URL}/analysis/breed`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(403);
  });

  test.each(routes)("OPTIONS %s → 204 for allowed origin", async (route) => {
    const res = await fetch(`${BASE_URL}${route}`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JWT Authentication
// ═══════════════════════════════════════════════════════════════════════════

describe("JWT authentication", () => {
  const authPath = "/analysis/breed";
  const validBody = { species: "dog", url: "https://example.com/img.jpg" };

  test("rejects request with no Authorization header → 401", async () => {
    const res = await req("POST", authPath, validBody);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT → 401", async () => {
    const res = await req("POST", authPath, validBody, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Bearer token → 401", async () => {
    const res = await req("POST", authPath, validBody, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects token without Bearer prefix → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const res = await req("POST", authPath, validBody, { Authorization: token });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects tampered JWT signature → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    const res = await req("POST", authPath, validBody, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects alg:none token → 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: "any-user" })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;
    const res = await req("POST", authPath, validBody, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("error response shape: success, errorKey, error, requestId", async () => {
    const res = await req("POST", authPath, validBody);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(typeof res.body.requestId).toBe("string");
  });

  test("CORS headers present on error responses for allowed origin", async () => {
    const res = await req("POST", authPath, validBody);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dead Routes (405)
// ═══════════════════════════════════════════════════════════════════════════

describe("Dead routes return 405", () => {
  const deadRoutes = [
    ["PUT", "/pets/updatePetEye"],
    ["GET", "/pets/gets3Image"],
    ["POST", "/pets/create-pet-basic-info"],
  ];

  test.each(deadRoutes)("%s %s → 405", async (method, path) => {
    const routeResource = path;
    const response = await routeRequest({
      event: {
        httpMethod: method,
        resource: routeResource,
        path: routeResource,
        headers: { Origin: VALID_ORIGIN },
      },
    });

    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Guard — /analysis/eye-upload/{petId} path parameter validation
// ═══════════════════════════════════════════════════════════════════════════

describe("Guard — eye-upload petId validation", () => {
  test("rejects invalid petId format → 400", async () => {
    const res = await req("POST", "/analysis/eye-upload/not-a-valid-id", undefined, tokenAuth({ userId: "any-user" }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidObjectId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Guard + Zod — /analysis/breed body validation
// ═══════════════════════════════════════════════════════════════════════════

describe("Guard + Zod — breed analysis body validation", () => {
  const auth = () => tokenAuth({ userId: "any-user" });

  test("rejects malformed JSON body → 400", async () => {
    const res = await rawReq("POST", "/analysis/breed", '{"species":"broken"', auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rejects empty body → 400", async () => {
    const res = await req("POST", "/analysis/breed", {}, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects missing species → 400", async () => {
    const res = await req("POST", "/analysis/breed", { url: "https://example.com/img.jpg" }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.speciesRequired");
  });

  test("rejects empty species → 400", async () => {
    const res = await req("POST", "/analysis/breed", { species: "", url: "https://example.com/img.jpg" }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.speciesRequired");
  });

  test("rejects missing url → 400", async () => {
    const res = await req("POST", "/analysis/breed", { species: "dog" }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.urlRequired");
  });

  test("rejects invalid url format → 400", async () => {
    const res = await req("POST", "/analysis/breed", { species: "dog", url: "not-a-url" }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidUrl");
  });

  test("rejects unknown fields (strict schema) → 400", async () => {
    const res = await req("POST", "/analysis/breed", {
      species: "dog",
      url: "https://example.com/img.jpg",
      extra: "field",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.unknownField");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /pets/create-pet-basic-info-with-image — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /pets/create-pet-basic-info-with-image", () => {
  const createPath = "/pets/create-pet-basic-info-with-image";

  test("rejects no auth → 401", async () => {
    const res = await multipartReq("POST", createPath);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("returns 404 when JWT user does not exist in DB", async () => {
    const res = await multipartReq("POST", createPath, {
      name: "TestPet",
      animal: "dog",
      sex: "M",
    }, [], tokenAuth({ userId: NONEXISTENT_USER_ID }));
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("eyeUpload.userNotFound");
  });

  // ── Zod schema enforcement ──

  test("rejects missing required name → 400", async () => {
    const res = await multipartReq("POST", createPath, {
      animal: "dog",
      sex: "M",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.nameRequired");
  });

  test("rejects missing required animal → 400", async () => {
    const res = await multipartReq("POST", createPath, {
      name: "TestPet",
      sex: "M",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.animalRequired");
  });

  test("rejects missing required sex → 400", async () => {
    const res = await multipartReq("POST", createPath, {
      name: "TestPet",
      animal: "dog",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.sexRequired");
  });

  test("rejects unknown field (strict schema) → 400", async () => {
    const res = await multipartReq("POST", createPath, {
      name: "TestPet",
      animal: "dog",
      sex: "M",
      isRegistered: "true",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.unknownField");
  });

  test("rejects invalid breedimage URL → 400", async () => {
    const res = await multipartReq("POST", createPath, {
      name: "TestPet",
      animal: "dog",
      sex: "M",
      breedimage: "not-a-url",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidUrl");
  });

  // ── Client-supplied userId is blocked by strict schema ──

  test("client-supplied userId in body is rejected by strict schema → 400", async () => {
    const res = await multipartReq("POST", createPath, {
      name: `IgnoreUserId_${TEST_TS}`,
      animal: "dog",
      sex: "M",
      userId: "000000000000000000aaaaaa",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.unknownField");
  });

  // ── NGO authorization enforcement ──

  test("non-NGO caller with ngoId in body gets 403 ngoRoleRequired", async () => {
    const res = await multipartReq("POST", createPath, {
      name: `NgoReject_${TEST_TS}`,
      animal: "dog",
      sex: "M",
      ngoId: "000000000000000000bbbbbb",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.ngoRoleRequired");
  });

  test("NGO caller without ngoId JWT claim gets 403 ngoIdClaimRequired", async () => {
    const res = await multipartReq("POST", createPath, {
      name: `NgoNoClaim_${TEST_TS}`,
      animal: "dog",
      sex: "M",
      ngoId: "000000000000000000cccccc",
    }, [], tokenAuth({ userId: state.ownerUserId, userRole: "ngo" }));
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.ngoIdClaimRequired");
  });

  test("NGO caller with mismatched ngoId gets 403 forbidden", async () => {
    const res = await multipartReq("POST", createPath, {
      name: `NgoMismatch_${TEST_TS}`,
      animal: "dog",
      sex: "M",
      ngoId: "000000000000000000dddddd",
    }, [], tokenAuth({ userId: state.ownerUserId, userRole: "ngo", ngoId: "000000000000000000eeeeee" }));
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.forbidden");
  });

  // ── Success path — creates pet, stores state for later tests ──

  test("owner creates pet successfully → 201 with id", async () => {
    const res = await multipartReq("POST", createPath, {
      name: `EyeTestPet_${TEST_TS}`,
      animal: "dog",
      sex: "M",
      birthday: "01/01/2020",
      breed: "Shiba Inu",
    }, [
      { field: "files", filename: "pet.jpg", contentType: "image/jpeg", content: tinyJpeg() },
    ], seededOwnerAuth());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeTruthy();
    state.createdPetId = res.body.id.toString();
  });

  // ── Rate limiting ──

  test("rate limits create-pet → 429 after exceeding limit", async () => {
    const rlUserId = NONEXISTENT_USER_ID;
    const { ip } = await seedRateLimit({
      action: "createPetWithImage",
      identifier: rlUserId,
      limit: 20,
      windowSec: 300,
      ip: "203.0.113.10",
    });
    const rlAuth = tokenAuth({ userId: rlUserId });
    const res = await multipartReq("POST", createPath, {
      name: "RLPet",
      animal: "dog",
      sex: "M",
    }, [], {
      ...rlAuth,
      "X-Forwarded-For": ip,
    });

    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("eyeUpload.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /pets/updatePetImage — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /pets/updatePetImage", () => {
  const updatePath = "/pets/updatePetImage";

  beforeAll(async () => {
    if (TEST_PET_ID && TEST_OWNER_USER_ID) {
      await ensureSeededUsers();
    }
  });

  test("rejects no auth → 401", async () => {
    const res = await multipartReq("POST", updatePath);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects missing petId → 400", async () => {
    const res = await multipartReq("POST", updatePath, {
      name: "NoPetId",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.petIdRequired");
  });

  test("rejects invalid petId format → 400", async () => {
    const res = await multipartReq("POST", updatePath, {
      petId: "not-valid",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidObjectId");
  });

  test("returns 404 for nonexistent pet", async () => {
    const res = await multipartReq("POST", updatePath, {
      petId: NONEXISTENT_PET_ID,
    }, [], seededOwnerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("eyeUpload.petNotFound");
  });

  test("rejects unknown field (strict schema) → 400", async () => {
    const res = await multipartReq("POST", updatePath, {
      petId: state.createdPetId || NONEXISTENT_PET_ID,
      isRegistered: "true",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.unknownField");
  });

  test("rejects malformed removedIndices → 400", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", updatePath, {
      petId: state.createdPetId,
      removedIndices: "not-json",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidRemovedIndices");
  });

  test("rejects removedIndices with non-integer values → 400", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", updatePath, {
      petId: state.createdPetId,
      removedIndices: '["a","b"]',
    }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidRemovedIndices");
  });

  // ── Exact 403 ownership tests with seeded users ──

  test("stranger gets exact 403 forbidden on owner's created pet", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", updatePath, {
      petId: state.createdPetId,
      name: "Hijacked",
    }, [], seededStrangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.forbidden");
  });

  // ── Owner success path ──

  test("owner updates pet name → 200", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", updatePath, {
      petId: state.createdPetId,
      name: `Updated_${TEST_TS}`,
    }, [], seededOwnerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeTruthy();
  });

  test("owner adds image to pet → 200", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", updatePath, {
      petId: state.createdPetId,
    }, [
      { field: "files", filename: "update.jpg", contentType: "image/jpeg", content: tinyJpeg() },
    ], seededOwnerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ── NGO cross-org protection ──

  test("non-NGO caller cannot set ngoId on pet → 403", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", updatePath, {
      petId: state.createdPetId,
      ngoId: "000000000000000000ffffff",
    }, [], seededOwnerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.forbidden");
  });

  // ── Fixture-based ownership ──

  petTest("fixture: stranger gets exact 403 on fixture pet", async () => {
    const res = await multipartReq("POST", updatePath, {
      petId: TEST_PET_ID,
      name: "Hijacked",
    }, [], seededStrangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.forbidden");
  }, FIXTURE_TEST_TIMEOUT_MS);

  petTest("fixture: owner updates fixture pet → 200", async () => {
    const res = await multipartReq("POST", updatePath, {
      petId: TEST_PET_ID,
      name: `FixtureUpdate_${TEST_TS}`,
    }, [], fixtureOwnerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, FIXTURE_TEST_TIMEOUT_MS);

  // ── Rate limiting ──

  test("rate limits updatePetImage → 429", async () => {
    const rlUserId = NONEXISTENT_USER_ID;
    const { ip } = await seedRateLimit({
      action: "updatePetImage",
      identifier: rlUserId,
      limit: 30,
      windowSec: 300,
      ip: "203.0.113.11",
    });
    const rlAuth = tokenAuth({ userId: rlUserId });
    const res = await multipartReq("POST", updatePath, {
      petId: NONEXISTENT_PET_ID,
    }, [], {
      ...rlAuth,
      "X-Forwarded-For": ip,
    });

    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("eyeUpload.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /analysis/eye-upload/{petId} — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /analysis/eye-upload/{petId}", () => {
  beforeAll(async () => {
    if (TEST_PET_ID && TEST_OWNER_USER_ID) {
      await ensureSeededUsers();
    }
  });

  test("rejects no auth → 401", async () => {
    const res = await multipartReq("POST", `/analysis/eye-upload/${NONEXISTENT_PET_ID}`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects invalid petId format → 400", async () => {
    const res = await multipartReq("POST", "/analysis/eye-upload/bad-id", {}, [], tokenAuth({ userId: "any" }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidObjectId");
  });

  test("returns 404 when caller (JWT user) does not exist in DB", async () => {
    const res = await multipartReq("POST", `/analysis/eye-upload/${NONEXISTENT_PET_ID}`, {}, [],
      tokenAuth({ userId: NONEXISTENT_USER_ID }));
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("eyeUpload.userNotFound");
  });

  test("existing caller + nonexistent pet → exact 404 petNotFound", async () => {
    const res = await multipartReq("POST", `/analysis/eye-upload/${NONEXISTENT_PET_ID}`, {}, [],
      seededOwnerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("eyeUpload.petNotFound");
  });

  // ── Exact 403 with seeded stranger (the core ownership proof) ──

  test("stranger existing user gets exact 403 forbidden on owner's pet", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", `/analysis/eye-upload/${state.createdPetId}`, {}, [],
      seededStrangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.forbidden");
  });

  // ── Missing input ──

  test("rejects missing image and image_url → 400", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", `/analysis/eye-upload/${state.createdPetId}`, {}, [],
      seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.missingArguments");
  });

  // ── File validation ──

  test("rejects unsupported image type → 400", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", `/analysis/eye-upload/${state.createdPetId}`, {}, [
      { field: "files", filename: "test.bmp", contentType: "image/bmp", content: Buffer.alloc(100, 0x42) },
    ], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.unsupportedFormat");
  });

  test("rejects zero-byte file → 413", async () => {
    if (!state.createdPetId) return;
    const res = await multipartReq("POST", `/analysis/eye-upload/${state.createdPetId}`, {}, [
      { field: "files", filename: "empty.jpg", contentType: "image/jpeg", content: Buffer.alloc(0) },
    ], seededOwnerAuth());
    expect([400, 413]).toContain(res.status);
    expect(["eyeUpload.missingArguments", "eyeUpload.fileTooSmall"]).toContain(res.body.errorKey);
  });

  // ── Fixture-based ownership ──

  petTest("fixture: stranger gets exact 403 on fixture pet", async () => {
    const res = await multipartReq("POST", `/analysis/eye-upload/${TEST_PET_ID}`, {}, [],
      seededStrangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("eyeUpload.forbidden");
  }, FIXTURE_TEST_TIMEOUT_MS);

  petTest("fixture: owner with missing input on fixture pet → 400", async () => {
    const res = await multipartReq("POST", `/analysis/eye-upload/${TEST_PET_ID}`, {}, [],
      fixtureOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.missingArguments");
  }, FIXTURE_TEST_TIMEOUT_MS);

  // ── Rate limiting ──

  test("rate limits eyeUploadAnalysis → 429", async () => {
    const rlUserId = NONEXISTENT_USER_ID;
    const { ip } = await seedRateLimit({
      action: "eyeUploadAnalysis",
      identifier: rlUserId,
      limit: 10,
      windowSec: 300,
      ip: "203.0.113.12",
    });
    const rlAuth = tokenAuth({ userId: rlUserId });
    const res = await multipartReq("POST", `/analysis/eye-upload/${NONEXISTENT_PET_ID}`, {}, [], {
      ...rlAuth,
      "X-Forwarded-For": ip,
    });

    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("eyeUpload.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /analysis/breed — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /analysis/breed", () => {
  test("rejects no auth → 401", async () => {
    const res = await req("POST", "/analysis/breed", { species: "dog", url: "https://example.com/img.jpg" });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects empty species → 400", async () => {
    const res = await req("POST", "/analysis/breed", {
      species: "",
      url: "https://example.com/img.jpg",
    }, seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.speciesRequired");
  });

  test("rejects invalid url → 400", async () => {
    const res = await req("POST", "/analysis/breed", {
      species: "dog",
      url: "not-a-url",
    }, seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidUrl");
  });

  test("rejects unknown fields → 400", async () => {
    const res = await req("POST", "/analysis/breed", {
      species: "dog",
      url: "https://example.com/img.jpg",
      malicious: "payload",
    }, seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.unknownField");
  });

  // ── Rate limiting ──

  test("rate limits breedAnalysis → 429", async () => {
    const rlUserId = NONEXISTENT_USER_ID;
    const { ip } = await seedRateLimit({
      action: "breedAnalysis",
      identifier: rlUserId,
      limit: 20,
      windowSec: 300,
      ip: "203.0.113.15",
    });
    const rlAuth = tokenAuth({ userId: rlUserId });
    const res = await req("POST", "/analysis/breed", {
      species: "dog",
      url: "https://example.com/img.jpg",
    }, {
      ...rlAuth,
      "X-Forwarded-For": ip,
    });

    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("eyeUpload.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /util/uploadImage — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /util/uploadImage", () => {
  const uploadPath = "/util/uploadImage";

  test("rejects no auth → 401", async () => {
    const res = await multipartReq("POST", uploadPath);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects request with no files → 400", async () => {
    const res = await multipartReq("POST", uploadPath, {}, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.noFilesUploaded");
  });

  test("rejects invalid image format (text/plain) → 400", async () => {
    const res = await multipartReq("POST", uploadPath, {}, [
      { field: "files", filename: "test.txt", contentType: "text/plain", content: Buffer.from("not an image") },
    ], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidImageFormat");
  });

  test("rejects more than 1 file → 400 tooManyFiles", async () => {
    const files = Array.from({ length: 2 }, (_, i) => ({
      field: "files",
      filename: `img${i}.jpg`,
      contentType: "image/jpeg",
      content: tinyJpeg(),
    }));
    const res = await multipartReq("POST", uploadPath, {}, files, seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.tooManyFiles");
  });

  test("successful JPEG upload → 200 with url", async () => {
    const res = await multipartReq("POST", uploadPath, {}, [
      { field: "files", filename: "success.jpg", contentType: "image/jpeg", content: tinyJpeg() },
    ], seededOwnerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.url).toBe("string");
    expect(res.body.url.length).toBeGreaterThan(0);
  });

  test("successful PNG upload → 200 with url", async () => {
    const res = await multipartReq("POST", uploadPath, {}, [
      { field: "files", filename: "success.png", contentType: "image/png", content: tinyPng() },
    ], seededOwnerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.url).toBe("string");
  });

  // ── Rate limiting ──

  test("rate limits uploadImage → 429", async () => {
    const rlUserId = NONEXISTENT_USER_ID;
    const { ip } = await seedRateLimit({
      action: "uploadImage",
      identifier: rlUserId,
      limit: 30,
      windowSec: 300,
      ip: "203.0.113.13",
    });
    const rlAuth = tokenAuth({ userId: rlUserId });
    const res = await multipartReq("POST", uploadPath, {}, [], {
      ...rlAuth,
      "X-Forwarded-For": ip,
    });

    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("eyeUpload.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /util/uploadPetBreedImage — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /util/uploadPetBreedImage", () => {
  const uploadPath = "/util/uploadPetBreedImage";

  test("rejects no auth → 401", async () => {
    const res = await multipartReq("POST", uploadPath);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects request with no files → 400", async () => {
    const res = await multipartReq("POST", uploadPath, { url: "breed_analysis/test" }, [], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.noFilesUploaded");
  });

  test("rejects invalid image format → 400", async () => {
    const res = await multipartReq("POST", uploadPath, { url: "breed_analysis/test" }, [
      { field: "files", filename: "test.txt", contentType: "text/plain", content: Buffer.from("not an image") },
    ], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidImageFormat");
  });

  test("rejects empty folder path → 400 invalidFolder", async () => {
    const res = await multipartReq("POST", uploadPath, { url: "" }, [
      { field: "files", filename: "img.jpg", contentType: "image/jpeg", content: tinyJpeg() },
    ], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidFolder");
  });

  test("rejects disallowed folder prefix → 400 invalidFolder", async () => {
    const res = await multipartReq("POST", uploadPath, { url: "malicious/path" }, [
      { field: "files", filename: "img.jpg", contentType: "image/jpeg", content: tinyJpeg() },
    ], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidFolder");
  });

  test("rejects path traversal attempt → 400 invalidFolder", async () => {
    const res = await multipartReq("POST", uploadPath, { url: "breed_analysis/../../../etc/passwd" }, [
      { field: "files", filename: "img.jpg", contentType: "image/jpeg", content: tinyJpeg() },
    ], seededOwnerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("eyeUpload.invalidFolder");
  });

  test("successful allowlisted upload (breed_analysis) → 200 with url", async () => {
    const res = await multipartReq("POST", uploadPath, { url: "breed_analysis/test" }, [
      { field: "files", filename: "breed.jpg", contentType: "image/jpeg", content: tinyJpeg() },
    ], seededOwnerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.url).toBe("string");
    expect(res.body.url.length).toBeGreaterThan(0);
  });

  test("successful upload to 'pets' prefix → 200", async () => {
    const res = await multipartReq("POST", uploadPath, { url: "pets/test-upload" }, [
      { field: "files", filename: "pet.png", contentType: "image/png", content: tinyPng() },
    ], seededOwnerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.url).toBe("string");
  });

  // ── Rate limiting ──

  test("rate limits uploadPetBreedImage → 429", async () => {
    const rlUserId = NONEXISTENT_USER_ID;
    const { ip } = await seedRateLimit({
      action: "uploadPetBreedImage",
      identifier: rlUserId,
      limit: 30,
      windowSec: 300,
      ip: "203.0.113.14",
    });
    const rlAuth = tokenAuth({ userId: rlUserId });
    const res = await multipartReq("POST", uploadPath, { url: "breed_analysis/rl" }, [], {
      ...rlAuth,
      "X-Forwarded-For": ip,
    });

    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("eyeUpload.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Coverage Gate — hard-fail if seeded state is missing
// ═══════════════════════════════════════════════════════════════════════════

describe("Coverage gate", () => {
  test("seeded owner state must be populated", () => {
    expect(state.ownerUserId).toBeTruthy();
    expect(state.ownerToken).toBeTruthy();
  });

  test("seeded stranger state must be populated", () => {
    expect(state.strangerUserId).toBeTruthy();
    expect(state.strangerToken).toBeTruthy();
  });

  test("at least one pet must have been created in the suite", () => {
    expect(state.createdPetId).toBeTruthy();
  });

  test("warns when fixture pet tests are skipped", () => {
    if (!TEST_PET_ID || !TEST_OWNER_USER_ID) {
      process.stdout.write(
        "\nWARNING: TEST_PET_ID / TEST_OWNER_USER_ID not set in env.json EyeUploadFunction.\n" +
        "Fixture-backed ownership tests are disabled.\n" +
        "Set them for additional coverage on pre-existing pets.\n\n",
      );
    }
  });
});
