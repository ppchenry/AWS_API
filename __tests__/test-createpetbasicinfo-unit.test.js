/**
 * CreatePetBasicInfo integration tests.
 * Uses the real MongoDB URI from env.json and invokes the lambda handler directly.
 */

const dns = require("dns");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const envConfig = require("../env.json");

const config = envConfig.CreatePetBasicInfoFunction || {};
const fallbackOwnerId =
  config.TEST_OWNER_USER_ID ||
  envConfig.PetVaccineRecordsFunction?.TEST_OWNER_USER_ID ||
  envConfig.PetBasicInfoFunction?.TEST_OWNER_USER_ID ||
  envConfig.GetAllPetsFunction?.TEST_OWNER_USER_ID ||
  "";

const JWT_SECRET = config.JWT_SECRET || "";
const MONGODB_URI = config.MONGODB_URI || envConfig.PetVaccineRecordsFunction?.MONGODB_URI || "";
const VALID_ORIGIN = (config.ALLOWED_ORIGINS || "").split(",")[0]?.trim() || "http://localhost:3000";
const TEST_OWNER_USER_ID = fallbackOwnerId;

let dbReady = false;
let connectAttempted = false;
let handler;

const cleanupState = {
  petIds: new Set(),
  rateLimitKeys: new Set(),
};

async function connectDB() {
  if (dbReady || connectAttempted || !MONGODB_URI) {
    return;
  }

  connectAttempted = true;

  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);

    if (mongoose.connection.readyState === 0) {
      let timeoutId;

      try {
        await Promise.race([
          mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 1,
          }),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("DB connect timeout (8 s)")), 8000);
          }),
        ]);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    dbReady = true;
  } catch (error) {
    console.warn("[test] MongoDB unavailable - CreatePetBasicInfo DB-backed checks will be skipped:", error.message);
    dbReady = false;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  dbReady = false;
}

function usersCol() {
  return mongoose.connection.db.collection("users");
}

function petsCol() {
  return mongoose.connection.db.collection("pets");
}

function rateLimitsCol() {
  return mongoose.connection.db.collection("rate_limits");
}

function dbTest(name, fn) {
  if (!MONGODB_URI || !TEST_OWNER_USER_ID || !JWT_SECRET) {
    return test.skip(name, fn);
  }

  return test(name, async () => {
    await connectDB();
    if (!dbReady) {
      console.log("[skip] " + name + " - no DB connection");
      return;
    }

    const owner = await usersCol().findOne({
      _id: new mongoose.Types.ObjectId(TEST_OWNER_USER_ID),
      deleted: { $ne: true },
    });

    if (!owner) {
      console.log("[skip] " + name + " - owner fixture user not found");
      return;
    }

    await fn();
  });
}

function loadHandler() {
  if (handler) {
    return handler;
  }

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
      userId: TEST_OWNER_USER_ID,
      userEmail: "createpetbasicinfo-test@example.com",
      userRole: "user",
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function makeEvent({ body, ipAddress, token }) {
  return {
    httpMethod: "POST",
    resource: "/pets/create-pet-basic-info",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: VALID_ORIGIN,
      "x-forwarded-for": ipAddress,
    },
    body,
    cookies: null,
    queryStringParameters: null,
    requestContext: {
      identity: {
        sourceIp: ipAddress,
      },
    },
  };
}

function makeContext(requestId) {
  return {
    awsRequestId: requestId,
    callbackWaitsForEmptyEventLoop: true,
  };
}

async function cleanupArtifacts() {
  if (!dbReady) {
    cleanupState.petIds.clear();
    cleanupState.rateLimitKeys.clear();
    return;
  }

  if (cleanupState.petIds.size > 0) {
    await petsCol().deleteMany({
      _id: {
        $in: Array.from(cleanupState.petIds, (id) => new mongoose.Types.ObjectId(id)),
      },
    });
  }

  if (cleanupState.rateLimitKeys.size > 0) {
    await rateLimitsCol().deleteMany({
      action: "createPetBasicInfo",
      key: { $in: Array.from(cleanupState.rateLimitKeys) },
    });
  }

  cleanupState.petIds.clear();
  cleanupState.rateLimitKeys.clear();
}

afterEach(async () => {
  await cleanupArtifacts();
});

afterAll(async () => {
  await cleanupArtifacts();
  await disconnectDB();
});

describe("CreatePetBasicInfo DB-backed hardening", () => {
  dbTest("creates a pet in MongoDB while keeping internal fields out of the response", async () => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ipAddress = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const rateLimitKey = `${ipAddress}:${TEST_OWNER_USER_ID}`;
    const payload = {
      name: `CreatePetBasicInfo ${uniqueSuffix}`,
      birthday: "2024-01-10",
      weight: 5.2,
      sex: "male",
      sterilization: true,
      animal: "cat",
      breed: "British Shorthair",
      features: "white paws",
      info: "friendly",
      status: "active",
      owner: "Integration Test",
      breedimage: ["https://example.com/pet.jpg"],
      ownerContact1: 12345678,
      ownerContact2: 87654321,
      contact1Show: true,
      contact2Show: false,
      tagId: `TAG-${uniqueSuffix}`,
      receivedDate: "11/01/2024",
    };

    cleanupState.rateLimitKeys.add(rateLimitKey);

    const response = await loadHandler()(makeEvent({
      body: JSON.stringify(payload),
      ipAddress,
      token: makeToken(),
    }), makeContext(`createpetbasicinfo-success-${uniqueSuffix}`));

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);

    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();
    expect(body.result).toEqual(expect.objectContaining({
      _id: expect.any(String),
      name: payload.name,
      tagId: payload.tagId,
      owner: payload.owner,
    }));
    expect(body.result).not.toHaveProperty("userId");
    expect(body.result).not.toHaveProperty("ngoId");
    expect(body.result).not.toHaveProperty("transferNGO");
    expect(body.result).not.toHaveProperty("createdAt");
    expect(body.result).not.toHaveProperty("updatedAt");
    expect(body.result).not.toHaveProperty("medicationRecordsCount");
    expect(body.result).not.toHaveProperty("vaccineRecordsCount");

    cleanupState.petIds.add(body.id);

    const createdPet = await petsCol().findOne({ _id: new mongoose.Types.ObjectId(body.id) });

    expect(createdPet).toBeTruthy();
    expect(String(createdPet.userId)).toBe(TEST_OWNER_USER_ID);
    expect(createdPet.transferNGO).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isTransferred: false,
        }),
      ])
    );
    expect(createdPet.medicationRecordsCount).toBe(0);
    expect(createdPet.vaccineRecordsCount).toBe(0);
    expect(createdPet.dewormRecordsCount).toBe(0);
    expect(createdPet.createdAt).toBeInstanceOf(Date);
    expect(createdPet.updatedAt).toBeInstanceOf(Date);

    const rateLimitEntry = await rateLimitsCol().findOne({
      action: "createPetBasicInfo",
      key: rateLimitKey,
    });

    expect(rateLimitEntry).toBeTruthy();
    expect(rateLimitEntry.count).toBeGreaterThanOrEqual(1);
  });

  dbTest("rejects client supplied userId and does not insert a pet record", async () => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ipAddress = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const rateLimitKey = `${ipAddress}:${TEST_OWNER_USER_ID}`;
    const payload = {
      userId: TEST_OWNER_USER_ID,
      name: `Blocked Create ${uniqueSuffix}`,
      birthday: "2024-01-10",
      sex: "male",
      animal: "cat",
      tagId: `TAG-BLOCK-${uniqueSuffix}`,
    };

    cleanupState.rateLimitKeys.add(rateLimitKey);

    const response = await loadHandler()(makeEvent({
      body: JSON.stringify(payload),
      ipAddress,
      token: makeToken(),
    }), makeContext(`createpetbasicinfo-userid-${uniqueSuffix}`));

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("unknownField");

    const createdPet = await petsCol().findOne({ tagId: payload.tagId });
    expect(createdPet).toBeNull();

    const rateLimitEntry = await rateLimitsCol().findOne({
      action: "createPetBasicInfo",
      key: rateLimitKey,
    });

    expect(rateLimitEntry).toBeTruthy();
  });

  dbTest("returns others.invalidJSON without creating rate-limit or pet records", async () => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ipAddress = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const rateLimitKey = `${ipAddress}:${TEST_OWNER_USER_ID}`;

    const response = await loadHandler()(makeEvent({
      body: "{",
      ipAddress,
      token: makeToken(),
    }), makeContext(`createpetbasicinfo-json-${uniqueSuffix}`));

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("others.invalidJSON");

    const rateLimitEntry = await rateLimitsCol().findOne({
      action: "createPetBasicInfo",
      key: rateLimitKey,
    });

    expect(rateLimitEntry).toBeNull();
  });
});