const envConfig = require("../env.json");

const lambdaEnv = envConfig.PetInfoByPetNumber || {};
const MONGODB_URI = lambdaEnv.MONGODB_URI || "";
const VALID_ORIGIN = (lambdaEnv.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")[0]
  .trim();
const TEST_TS = Date.now();
const TEST_TAG_PREFIX = `PETINFO-TEST-${TEST_TS}`;

let mongoose;
let dbReady = false;
let connectAttempted = false;
let handler;
let getReadConnection;

function buildEvent(overrides = {}) {
  return {
    httpMethod: "GET",
    resource: "/pets/getPetInfobyTagId/{tagId}",
    pathParameters: { tagId: `${TEST_TAG_PREFIX}-DEFAULT` },
    headers: {
      origin: VALID_ORIGIN,
    },
    requestContext: {
      requestId: "req-1",
    },
    ...overrides,
  };
}

async function connectDB() {
  if (dbReady || connectAttempted || !MONGODB_URI) {
    return;
  }

  connectAttempted = true;

  try {
    mongoose = await getReadConnection();
    dbReady = true;
  } catch (error) {
    console.warn("[test] MongoDB unavailable - DB-backed PetInfoByPetNumber checks will be skipped:", error.message);
    dbReady = false;
  }
}

async function disconnectDB() {
  if (!mongoose) {
    return;
  }

  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch {
    // best-effort cleanup
  }

  dbReady = false;
}

function petsCol() {
  return mongoose.connection.db.collection("pets");
}

async function cleanupSeededPets() {
  if (!dbReady) {
    return;
  }

  await petsCol().deleteMany({
    tagId: { $regex: `^${TEST_TAG_PREFIX}` },
  });
}

async function seedPet(overrides = {}) {
  if (!dbReady) {
    throw new Error("MongoDB must be connected before seeding pets");
  }

  const now = new Date();
  const ObjectId = mongoose.Types.ObjectId;
  const tagId = overrides.tagId || `${TEST_TAG_PREFIX}-${new ObjectId().toString().slice(-6)}`;

  const doc = {
    userId: new ObjectId(),
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
    ngoId: new ObjectId(),
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
  ? (name, fn) => test(name, async () => {
      await connectDB();
      if (!dbReady) {
        console.log("[skip] " + name + " - no DB connection");
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
  process.env.ALLOWED_ORIGINS = lambdaEnv.ALLOWED_ORIGINS || "http://localhost:3000";

  require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
  handler = require("../functions/PetInfoByPetNumber").handler;
  ({ getReadConnection } = require("../functions/PetInfoByPetNumber/src/config/db"));
});

afterAll(async () => {
  try {
    await cleanupSeededPets();
  } catch {
    // best-effort cleanup
  }

  await disconnectDB();
});

describe("PetInfoByPetNumber", () => {
  test("returns 204 for allowed OPTIONS preflight", async () => {
    const response = await handler(buildEvent({ httpMethod: "OPTIONS" }), {
      awsRequestId: "aws-1",
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe(VALID_ORIGIN);
  });

  test("returns 403 for disallowed OPTIONS preflight", async () => {
    const response = await handler(buildEvent({
      httpMethod: "OPTIONS",
      headers: { origin: "http://evil.test" },
    }), {
      awsRequestId: "aws-2",
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).errorKey).toBe("others.originNotAllowed");
  });

  test("returns 400 when tagId is missing", async () => {
    const response = await handler(buildEvent({ pathParameters: {} }), {
      awsRequestId: "aws-3",
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("petInfoByPetNumber.errors.tagIdRequired");
  });

  test("returns 405 for unsupported methods", async () => {
    const response = await handler(buildEvent({ httpMethod: "DELETE" }), {
      awsRequestId: "aws-4",
    });

    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
  });

  dbTest("returns 404 when pet is not found in MongoDB", async () => {
    const response = await handler(buildEvent({
      pathParameters: { tagId: `${TEST_TAG_PREFIX}-MISSING` },
    }), {
      awsRequestId: "aws-5",
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).errorKey).toBe("petInfoByPetNumber.errors.notFound");
  });

  dbTest("returns sanitized pet info from MongoDB and hides internal fields", async () => {
    const pet = await seedPet();

    const response = await handler(buildEvent({
      pathParameters: { tagId: pet.tagId },
    }), {
      awsRequestId: "aws-6",
    });

    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body).not.toHaveProperty("id");
    expect(body.form.name).toBe("Milo");
    expect(body.form.breedimage).toEqual(["https://cdn.example/pet.jpg"]);
    expect(body.form.tagId).toBe(pet.tagId);
    expect(body.form).not.toHaveProperty("userId");
    expect(body.form).not.toHaveProperty("ngoId");
    expect(body.form).not.toHaveProperty("ngoPetId");
    expect(body.form).not.toHaveProperty("ownerContact1");
    expect(body.form.ownerContact2).toBe(87654321);
    expect(body.form.contact1Show).toBe(false);
    expect(body.form.contact2Show).toBe(true);
  });
});