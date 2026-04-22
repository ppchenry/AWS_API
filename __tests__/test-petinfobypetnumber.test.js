/**
 * PetInfoByPetNumber integration tests.
 * Invokes the Lambda handler directly — no SAM required.
 * Run with: npm test -- --runTestsByPath __tests__/test-petinfobypetnumber.test.js
 *
 * Required env.json keys under PetInfoByPetNumber:
 *   JWT_SECRET, JWT_BYPASS, ALLOWED_ORIGINS, MONGODB_URI
 *
 * Security note: a tag that does not exist returns HTTP 200 with all-null form
 * fields — never 404 — to prevent enumeration of whether a tag ID exists.
 */

const envConfig = require("../env.json");

const lambdaEnv = envConfig.PetInfoByPetNumber || {};
const MONGODB_URI = lambdaEnv.MONGODB_URI || "";
const VALID_ORIGIN = (lambdaEnv.ALLOWED_ORIGINS || "http://localhost:3000").split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";
const TEST_TS = Date.now();
const TAG_PREFIX = `PIBN-TEST-${TEST_TS}`;

let mongoose;
let dbReady = false;
let connectAttempted = false;
let handler;
let getReadConnection;

function buildEvent(overrides = {}) {
  return {
    httpMethod: "GET",
    resource: "/pets/getPetInfobyTagId/{tagId}",
    pathParameters: { tagId: `${TAG_PREFIX}-DEFAULT` },
    headers: { origin: VALID_ORIGIN },
    queryStringParameters: { lang: "en" },
    requestContext: { requestId: "req-test-1" },
    ...overrides,
  };
}

async function connectDB() {
  if (dbReady || connectAttempted || !MONGODB_URI) return;
  connectAttempted = true;
  try {
    require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
    mongoose = await getReadConnection();
    dbReady = true;
  } catch (err) {
    console.warn("[test] MongoDB unavailable - PetInfoByPetNumber DB tests will be skipped:", err.message);
  }
}

async function disconnectDB() {
  if (!mongoose) return;
  try {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  } catch { /* best-effort */ }
  dbReady = false;
}

function petsCol() {
  return mongoose.connection.db.collection("pets");
}

async function cleanupSeededPets() {
  if (!dbReady) return;
  await petsCol().deleteMany({ tagId: { $regex: `^${TAG_PREFIX}` } });
}

async function seedPet(overrides = {}) {
  const now = new Date();
  const ObjectId = mongoose.Types.ObjectId;
  const tagId = overrides.tagId || `${TAG_PREFIX}-${new ObjectId().toString().slice(-6)}`;
  const doc = {
    userId: new ObjectId(),
    ngoId: new ObjectId(),
    name: "Milo",
    breedimage: ["https://cdn.example/pet.jpg"],
    animal: "cat",
    birthday: new Date("2022-01-01T00:00:00.000Z"),
    weight: 5,
    sex: "male",
    sterilization: true,
    breed: "British Shorthair",
    features: "white paws",
    info: "friendly",
    status: "active",
    owner: "Jimmy",
    ownerContact1: 12345678,
    ownerContact2: 87654321,
    contact1Show: false,
    contact2Show: true,
    tagId,
    isRegistered: true,
    receivedDate: new Date("2022-02-01T00:00:00.000Z"),
    ngoPetId: "NGO-22",
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...overrides,
  };
  await petsCol().insertOne(doc);
  return doc;
}

const dbTest = MONGODB_URI
  ? (name, fn) =>
      test(name, async () => {
        await connectDB();
        if (!dbReady) {
          console.log(`[skip] ${name} - no DB connection`);
          return;
        }
        await fn();
      })
  : test.skip;

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = MONGODB_URI;
  process.env.JWT_SECRET = lambdaEnv.JWT_SECRET || "test-secret";
  process.env.JWT_BYPASS = lambdaEnv.JWT_BYPASS || "false";
  process.env.ALLOWED_ORIGINS = lambdaEnv.ALLOWED_ORIGINS || VALID_ORIGIN;
  require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
  handler = require("../functions/PetInfoByPetNumber").handler;
  ({ getReadConnection } = require("../functions/PetInfoByPetNumber/src/config/db"));
});

afterAll(async () => {
  try { await cleanupSeededPets(); } catch { /* best-effort */ }
  await disconnectDB();
});

// ─── OPTIONS preflight ────────────────────────────────────────────────────────

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for allowed origin", async () => {
    const response = await handler(
      buildEvent({ httpMethod: "OPTIONS" }),
      { awsRequestId: "aws-opts-1" }
    );
    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe(VALID_ORIGIN);
    expect(response.headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  test("returns 403 for disallowed origin", async () => {
    const response = await handler(
      buildEvent({ httpMethod: "OPTIONS", headers: { origin: DISALLOWED_ORIGIN } }),
      { awsRequestId: "aws-opts-2" }
    );
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).errorKey).toBe("others.originNotAllowed");
  });

  test("returns 403 when Origin header is absent", async () => {
    const response = await handler(
      buildEvent({ httpMethod: "OPTIONS", headers: {} }),
      { awsRequestId: "aws-opts-3" }
    );
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).errorKey).toBe("others.originNotAllowed");
  });
});

// ─── Guard validation ─────────────────────────────────────────────────────────

describe("Guard validation", () => {
  test("returns 400 when tagId is missing", async () => {
    const response = await handler(
      buildEvent({ pathParameters: {} }),
      { awsRequestId: "aws-guard-1" }
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("petInfoByPetNumber.errors.tagIdRequired");
  });

  test("returns 400 when tagId is blank whitespace", async () => {
    const response = await handler(
      buildEvent({ pathParameters: { tagId: "   " } }),
      { awsRequestId: "aws-guard-2" }
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("petInfoByPetNumber.errors.tagIdRequired");
  });

  test("returns 400 when tagId exceeds 120 characters", async () => {
    const response = await handler(
      buildEvent({ pathParameters: { tagId: "x".repeat(121) } }),
      { awsRequestId: "aws-guard-3" }
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("others.invalidPathParam");
  });

  test("error shape includes success:false, errorKey, and CORS header", async () => {
    const response = await handler(
      buildEvent({ pathParameters: {} }),
      { awsRequestId: "aws-guard-shape-1" }
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.errorKey).toBe("string");
    expect(typeof body.error).toBe("string");
    expect(response.headers["Access-Control-Allow-Origin"]).toBe(VALID_ORIGIN);
  });
});

// ─── Method enforcement ───────────────────────────────────────────────────────

describe("Method enforcement", () => {
  test("returns 405 for DELETE", async () => {
    const response = await handler(
      buildEvent({ httpMethod: "DELETE" }),
      { awsRequestId: "aws-meth-1" }
    );
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
  });

  test("returns 405 for POST", async () => {
    const response = await handler(
      buildEvent({ httpMethod: "POST" }),
      { awsRequestId: "aws-meth-2" }
    );
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
  });

  test("returns 405 for PUT", async () => {
    const response = await handler(
      buildEvent({ httpMethod: "PUT" }),
      { awsRequestId: "aws-meth-3" }
    );
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
  });
});

// ─── Tag lookup ───────────────────────────────────────────────────────────────

describe("Tag lookup — security: unknown tag returns 200 with null-form (no tag enumeration)", () => {
  dbTest("returns 200 with all-null form fields for a tag that does not exist in DB", async () => {
    const response = await handler(
      buildEvent({ pathParameters: { tagId: `${TAG_PREFIX}-DOES-NOT-EXIST` } }),
      { awsRequestId: "aws-miss-1" }
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.form).toBeDefined();
    // All public fields should be null — caller cannot distinguish missing from found
    expect(body.form.name).toBeNull();
    expect(body.form.animal).toBeNull();
    expect(body.form.breed).toBeNull();
    expect(body.form.breedimage).toBeNull();
    expect(body.form.status).toBeNull();
  });

  dbTest("returns 200 with sanitized public fields for an existing pet", async () => {
    const pet = await seedPet();
    const response = await handler(
      buildEvent({ pathParameters: { tagId: pet.tagId } }),
      { awsRequestId: "aws-found-1" }
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);

    // Public fields present
    expect(body.form.name).toBe("Milo");
    expect(body.form.breed).toBe("British Shorthair");
    expect(body.form.breedimage).toEqual(["https://cdn.example/pet.jpg"]);
    expect(body.form.sex).toBe("male");
    expect(body.form.sterilization).toBe(true);
    expect(body.form.animal).toBe("cat");
    expect(body.form.status).toBe("active");
    expect(body.form.features).toBe("white paws");
    expect(body.form.info).toBe("friendly");

    // Internal ownership fields must not be present
    expect(body.form).not.toHaveProperty("userId");
    expect(body.form).not.toHaveProperty("ngoId");
    expect(body.form).not.toHaveProperty("ngoPetId");
    expect(body.form).not.toHaveProperty("_id");
    expect(body.form).not.toHaveProperty("tagId");

    // Owner contact fields must not be present
    expect(body.form).not.toHaveProperty("ownerContact1");
    expect(body.form).not.toHaveProperty("ownerContact2");
    expect(body.form).not.toHaveProperty("contact1Show");
    expect(body.form).not.toHaveProperty("contact2Show");
    expect(body.form).not.toHaveProperty("owner");
  });

  dbTest("soft-deleted pet returns 200 with null-form (same as missing)", async () => {
    const pet = await seedPet({ deleted: true });
    const response = await handler(
      buildEvent({ pathParameters: { tagId: pet.tagId } }),
      { awsRequestId: "aws-deleted-1" }
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.form.name).toBeNull();
  });
});
