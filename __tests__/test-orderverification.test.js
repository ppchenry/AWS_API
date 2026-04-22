/**
 * OrderVerification Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --runTestsByPath __tests__/test-orderverification.test.js
 *
 * References:
 * - __tests__/test-userroutes.test.js for shared integration-test structure.
 * - dev_docs/test_reports/USERROUTES_TEST_REPORT.md for auth, ownership,
 *   response-shape, and stable errorKey assertion expectations.
 */

const jwt = require("jsonwebtoken");
const envConfig = require("../env.json");
const { routeRequest } = require("../functions/OrderVerification/src/router");

jest.setTimeout(60000);

const BASE_URL = process.env.ORDER_VERIFICATION_BASE_URL || "http://localhost:3000";
const TEST_TS = Date.now();
const OV_ENV = envConfig.OrderVerification || envConfig.OrderVerificationFunction || {};
const JWT_SECRET = OV_ENV.JWT_SECRET;
const MONGODB_URI = OV_ENV.MONGODB_URI || "";
const VALID_ORIGIN = (OV_ENV.ALLOWED_ORIGINS || "http://localhost:3000").split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";
const DB_CONNECT_TIMEOUT_MS = 10000;

const OWNER_EMAIL = `ov_owner_${TEST_TS}@test.com`;
const OTHER_EMAIL = `ov_other_${TEST_TS}@test.com`;
const ADMIN_USER_ID = "0000000000000000000000ad";
const OWNER_USER_ID = "000000000000000000000011";
const OTHER_USER_ID = "000000000000000000000022";
const NONEXISTENT_OBJECT_ID = "000000000000000000000000";

let mongoose;
let testConnection;
let dbReady = false;
let connectAttempted = false;
let seedAttempted = false;
let dbInitError = null;
let seedError = null;

const state = {
  orderTempId: `ov_order_${TEST_TS}`,
  duplicateOrderId: `ov_duplicate_${TEST_TS}`,
  tagId: `OVTAG${TEST_TS}`,
  duplicateTagId: `OVDUP${TEST_TS}`,
  contact: `+8525${String(TEST_TS).slice(-7)}`,
  verificationId: null,
  duplicateVerificationId: null,
  createdOrderIds: [],
  createdOVIds: [],
};

async function connectDB() {
  if (dbReady) return;
  if (dbInitError) throw dbInitError;
  if (connectAttempted || !MONGODB_URI) return;
  connectAttempted = true;
  try {
    require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
    mongoose = require("mongoose");
    if (!testConnection || testConnection.readyState === 0) {
      testConnection = mongoose.createConnection(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        maxPoolSize: 1,
      });
      await withTimeout(
        testConnection.asPromise(),
        DB_CONNECT_TIMEOUT_MS,
        "MongoDB connection timed out"
      );
    }
    dbReady = true;
  } catch (err) {
    dbInitError = new Error(
      `MongoDB unavailable for DB-backed OrderVerification tests: ${err.message}`
    );
    try { testConnection?.destroy(); } catch { /* best-effort */ }
    testConnection = null;
    dbReady = false;
    throw dbInitError;
  }
}

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

function ordersCol() {
  return testConnection.db.collection("order");
}

function orderVerificationsCol() {
  return testConnection.db.collection("orderVerification");
}

async function getPersistedOrderVerification(id = state.verificationId) {
  await ensureSeedData();
  return orderVerificationsCol().findOne({ _id: new mongoose.Types.ObjectId(id) });
}

async function getPersistedOrder(tempId = state.orderTempId) {
  await ensureSeedData();
  return ordersCol().findOne({ tempId });
}

async function ensureSeedData() {
  await connectDB();
  if (seedError) throw seedError;
  if (seedAttempted) return;
  seedAttempted = true;

  try {
    const now = new Date();

    const order = await ordersCol().insertOne({
      isPTagAir: false,
      tempId: state.orderTempId,
      lastName: "VerificationOwner",
      email: OWNER_EMAIL,
      phoneNumber: "",
      address: "123 Test Street",
      paymentWay: "FPS",
      delivery: "SF Express",
      option: "PTag",
      price: 100,
      petName: "SeedPet",
      petContact: "51234567",
      language: "en",
      createdAt: now,
      updatedAt: now,
    });
    state.createdOrderIds.push(order.insertedId.toString());

    const orderVerification = await orderVerificationsCol().insertOne({
      tagId: state.tagId,
      staffVerification: false,
      cancelled: false,
      contact: state.contact,
      petName: "SeedPet",
      shortUrl: "https://example.com/seed",
      masterEmail: OWNER_EMAIL,
      qrUrl: "https://example.com/qr",
      petUrl: "https://example.com/pet",
      orderId: state.orderTempId,
      location: "Seed Location",
      petHuman: "Seed Human",
      pendingStatus: false,
      option: "PTag",
      type: "standard",
      optionSize: "M",
      optionColor: "Blue",
      price: 100,
      discountProof: "",
      createdAt: now,
      updatedAt: now,
    });
    state.verificationId = orderVerification.insertedId.toString();
    state.createdOVIds.push(state.verificationId);

    const duplicateOrderVerification = await orderVerificationsCol().insertOne({
      tagId: state.duplicateTagId,
      staffVerification: false,
      cancelled: false,
      contact: `+8526${String(TEST_TS).slice(-7)}`,
      petName: "DuplicatePet",
      shortUrl: "https://example.com/duplicate",
      masterEmail: OWNER_EMAIL,
      qrUrl: "https://example.com/duplicate-qr",
      petUrl: "https://example.com/duplicate-pet",
      orderId: state.duplicateOrderId,
      location: "Duplicate Location",
      petHuman: "Duplicate Human",
      pendingStatus: false,
      option: "PTag",
      type: "standard",
      optionSize: "S",
      optionColor: "Green",
      price: 120,
      discountProof: "",
      createdAt: now,
      updatedAt: now,
    });
    state.duplicateVerificationId = duplicateOrderVerification.insertedId.toString();
    state.createdOVIds.push(state.duplicateVerificationId);
  } catch (err) {
    seedError = new Error(`Failed to seed OrderVerification test data: ${err.message}`);
    throw seedError;
  }
}

const dbTest = MONGODB_URI
  ? (name, fn, timeout) => test(name, async () => {
      await ensureSeedData();
      await fn();
    }, timeout)
  : test.skip;

afterAll(async () => {
  if (dbReady && testConnection) {
    try {
      if (state.createdOrderIds.length > 0) {
        await ordersCol().deleteMany({
          _id: { $in: state.createdOrderIds.map((id) => new mongoose.Types.ObjectId(id)) },
        });
      }

      if (state.createdOVIds.length > 0) {
        await orderVerificationsCol().deleteMany({
          _id: { $in: state.createdOVIds.map((id) => new mongoose.Types.ObjectId(id)) },
        });
      }
    } catch {
      // Best-effort cleanup only.
    }

    await testConnection.close();
    testConnection = null;
    dbReady = false;
  }
});

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...opts });
}

function adminAuth() {
  return {
    Authorization: `Bearer ${makeToken({
      userId: ADMIN_USER_ID,
      userEmail: "admin@example.com",
      userRole: "admin",
    })}`,
  };
}

function ownerAuth() {
  return {
    Authorization: `Bearer ${makeToken({
      userId: OWNER_USER_ID,
      userEmail: OWNER_EMAIL,
      userRole: "user",
    })}`,
  };
}

function otherUserAuth() {
  return {
    Authorization: `Bearer ${makeToken({
      userId: OTHER_USER_ID,
      userEmail: OTHER_EMAIL,
      userRole: "user",
    })}`,
  };
}

function developerAuth() {
  return {
    Authorization: `Bearer ${makeToken({
      userId: "0000000000000000000000de",
      userEmail: "developer@example.com",
      userRole: "developer",
    })}`,
  };
}

function expiredAuth() {
  return {
    Authorization: `Bearer ${jwt.sign(
      { userId: OWNER_USER_ID, userEmail: OWNER_EMAIL, userRole: "user" },
      JWT_SECRET,
      { expiresIn: -60 }
    )}`,
  };
}

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

function buildMultipart(fields = {}) {
  const boundary = `----JestOrderVerificationBoundary${TEST_TS}`;
  const buffers = [];

  for (const [key, value] of Object.entries(fields)) {
    buffers.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(buffers), boundary };
}

async function multipartReq(method, path, fields = {}, headers = {}) {
  const { body, boundary } = buildMultipart(fields);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(`${BASE_URL}/v2/orderVerification/${state.tagId}`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 with errorKey for a disallowed origin", async () => {
    const res = await fetch(`${BASE_URL}/v2/orderVerification/${state.tagId}`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("common.originNotAllowed");
  });
});

describe("JWT authentication", () => {
  const authPath = "/v2/orderVerification/getAllOrders";

  test("rejects missing Authorization header -> 401", async () => {
    const res = await req("GET", authPath);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects expired JWT -> 401", async () => {
    const res = await req("GET", authPath, undefined, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects garbage Bearer token -> 401", async () => {
    const res = await req("GET", authPath, undefined, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects token without Bearer prefix -> 401", async () => {
    const token = makeToken({ userId: OWNER_USER_ID, userEmail: OWNER_EMAIL });
    const res = await req("GET", authPath, undefined, { Authorization: token });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects tampered JWT signature -> 401", async () => {
    const token = makeToken({ userId: OWNER_USER_ID, userEmail: OWNER_EMAIL });
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    const res = await req("GET", authPath, undefined, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects alg:none token -> 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: OWNER_USER_ID })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;
    const res = await req("GET", authPath, undefined, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("error response shape includes success, errorKey, error, requestId", async () => {
    const res = await req("GET", authPath);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(typeof res.body.requestId).toBe("string");
  });

  test("CORS headers are present on auth errors for allowed origin", async () => {
    const res = await req("GET", authPath);
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

describe("Request guard and router", () => {
  test("rejects malformed JSON on PUT /v2/orderVerification/{tagId} -> 400", async () => {
    const res = await rawReq("PUT", `/v2/orderVerification/${state.tagId}`, '{"petName":"broken"', adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("common.invalidJSON");
  });

  test("rejects empty JSON body on PUT /v2/orderVerification/{tagId} -> 400", async () => {
    const res = await req("PUT", `/v2/orderVerification/${state.tagId}`, {}, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("common.missingParams");
  });

  test("rejects invalid WhatsApp link ObjectId before DB lookup -> 400", async () => {
    const res = await req("GET", "/v2/orderVerification/whatsapp-order-link/not-a-valid-id", undefined, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("orderVerification.errors.invalidVerificationId");
  });

  test("router unit: frozen DELETE /v2/orderVerification/{tagId} returns 405", async () => {
    const response = await routeRequest({
      event: {
        httpMethod: "DELETE",
        resource: "/v2/orderVerification/{tagId}",
        pathParameters: { tagId: state.tagId },
        headers: { Origin: VALID_ORIGIN },
        queryStringParameters: null,
        awsRequestId: "router-unit-test",
      },
      body: null,
    });
    const res = {
      status: response.statusCode,
      body: JSON.parse(response.body),
    };
    expect(res.status).toBe(405);
    expect(res.body.errorKey).toBe("common.methodNotAllowed");
  });
});

describe("GET /v2/orderVerification/getAllOrders", () => {
  dbTest("rejects a non-admin authenticated user -> 403", async () => {
    const res = await req("GET", "/v2/orderVerification/getAllOrders", undefined, ownerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  dbTest("returns seeded orders with admin token", async () => {
    const res = await req("GET", "/v2/orderVerification/getAllOrders", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.allOrders)).toBe(true);
    expect(res.body.allOrders.some((order) => order.tagId === state.tagId)).toBe(true);
  });
});

describe("GET /v2/orderVerification/{tagId}", () => {
  dbTest("gets an order verification by tagId", async () => {
    const res = await req("GET", `/v2/orderVerification/${state.tagId}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.form.tagId).toBe(state.tagId);
    expect(res.body.form.masterEmail).toBe(OWNER_EMAIL);
    expect(res.body.form.discountProof).toBeUndefined();
  });

  dbTest("returns 404 for non-existent tagId", async () => {
    const res = await req("GET", `/v2/orderVerification/NO_SUCH_TAG_${TEST_TS}`, undefined, adminAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("orderVerification.errors.notFound");
  });
});

describe("PUT /v2/orderVerification/{tagId}", () => {
  dbTest("updates tag verification fields", async () => {
    const res = await req("PUT", `/v2/orderVerification/${state.tagId}`, {
      verifyDate: "21/04/2026",
      petName: "UpdatedSeedPet",
      location: "Updated Location",
    }, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(state.verificationId);
    expect(res.body.notificationDispatched).toBe(false);

    const persisted = await getPersistedOrderVerification();
    expect(persisted.petName).toBe("UpdatedSeedPet");
    expect(persisted.location).toBe("Updated Location");
    expect(persisted.verifyDate).toBeInstanceOf(Date);
    expect(persisted.verifyDate.toISOString().slice(0, 10)).toBe("2026-04-21");
  });

  dbTest("rejects invalid verifyDate -> 400", async () => {
    const res = await req("PUT", `/v2/orderVerification/${state.tagId}`, {
      verifyDate: "not-a-date",
    }, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("orderVerification.errors.invalidDate");
  });

  dbTest("rejects duplicated orderId -> 409", async () => {
    const res = await req("PUT", `/v2/orderVerification/${state.tagId}`, {
      orderId: state.duplicateOrderId,
    }, adminAuth());
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("orderVerification.errors.duplicateOrderId");
  });

  dbTest("returns 404 when updating a non-existent tagId", async () => {
    const res = await req("PUT", `/v2/orderVerification/NO_SUCH_TAG_${TEST_TS}`, {
      petName: "Missing",
    }, adminAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("orderVerification.errors.notFound");
  });
});

describe("GET /v2/orderVerification/supplier/{orderId}", () => {
  dbTest("allows the linked order owner to fetch supplier verification", async () => {
    const res = await req("GET", `/v2/orderVerification/supplier/${state.orderTempId}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.form.tagId).toBe(state.tagId);
    expect(res.body.form.orderId).toBe(state.orderTempId);
  });

  dbTest("allows lookup by contact fallback", async () => {
    const res = await req(
      "GET",
      `/v2/orderVerification/supplier/${encodeURIComponent(state.contact)}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.form.tagId).toBe(state.tagId);
    expect(res.body.form.contact).toBe(state.contact);
  });

  dbTest("allows lookup by tagId fallback", async () => {
    const res = await req("GET", `/v2/orderVerification/supplier/${state.tagId}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.form.tagId).toBe(state.tagId);
  });

  dbTest("allows developer role to bypass supplier ownership checks", async () => {
    const res = await req("GET", `/v2/orderVerification/supplier/${state.orderTempId}`, undefined, developerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.form.tagId).toBe(state.tagId);
  });

  dbTest("rejects a different user by ownership check -> 403", async () => {
    const res = await req("GET", `/v2/orderVerification/supplier/${state.orderTempId}`, undefined, otherUserAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  dbTest("returns 404 for unknown supplier identifier", async () => {
    const res = await req("GET", `/v2/orderVerification/supplier/NO_SUCH_ORDER_${TEST_TS}`, undefined, adminAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("orderVerification.errors.notFound");
  });
});

describe("PUT /v2/orderVerification/supplier/{orderId}", () => {
  test("rejects empty multipart body before DB lookup -> 400", async () => {
    const res = await fetch(`${BASE_URL}/v2/orderVerification/supplier/${state.orderTempId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "multipart/form-data; boundary=----EmptyOrderVerificationBoundary",
        Origin: VALID_ORIGIN,
        ...ownerAuth(),
      },
      body: "",
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.errorKey).toBe("common.missingParams");
  });

  dbTest("updates supplier-editable fields for the linked owner", async () => {
    const res = await multipartReq("PUT", `/v2/orderVerification/supplier/${state.orderTempId}`, {
      petName: "SupplierUpdatedPet",
      location: "Supplier Updated Location",
      contact: " 59876543 ",
      petContact: " 51230000 ",
    }, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Tag info updated successfully");

    const persistedVerification = await getPersistedOrderVerification();
    expect(persistedVerification.petName).toBe("SupplierUpdatedPet");
    expect(persistedVerification.location).toBe("Supplier Updated Location");
    expect(persistedVerification.contact).toBe("59876543");

    const persistedOrder = await getPersistedOrder();
    expect(persistedOrder.petContact).toBe("51230000");
  });

  dbTest("rejects invalid pendingStatus type -> 400", async () => {
    const res = await multipartReq("PUT", `/v2/orderVerification/supplier/${state.orderTempId}`, {
      pendingStatus: "not-a-boolean",
    }, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("orderVerification.errors.invalidPendingStatus");
  });

  dbTest("rejects supplier update from a different user -> 403", async () => {
    const res = await multipartReq("PUT", `/v2/orderVerification/supplier/${state.orderTempId}`, {
      petName: "ShouldNotUpdate",
    }, otherUserAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });
});

describe("GET /v2/orderVerification/ordersInfo/{tempId}", () => {
  dbTest("returns order contact summary to the linked owner", async () => {
    const res = await req("GET", `/v2/orderVerification/ordersInfo/${state.orderTempId}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.form.petContact).toBeDefined();
  });

  dbTest("rejects a different user by ownership check -> 403", async () => {
    const res = await req("GET", `/v2/orderVerification/ordersInfo/${state.orderTempId}`, undefined, otherUserAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  dbTest("returns 404 for non-existent tempId", async () => {
    const res = await req("GET", `/v2/orderVerification/ordersInfo/NO_SUCH_TEMP_${TEST_TS}`, undefined, adminAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("orderVerification.errors.orderNotFound");
  });
});

describe("GET /v2/orderVerification/whatsapp-order-link/{_id}", () => {
  dbTest("returns WhatsApp order-link data to the linked owner", async () => {
    const res = await req("GET", `/v2/orderVerification/whatsapp-order-link/${state.verificationId}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(state.verificationId);
    expect(res.body.form.tagId).toBe(state.tagId);
  });

  dbTest("rejects a different user by ownership check -> 403", async () => {
    const res = await req("GET", `/v2/orderVerification/whatsapp-order-link/${state.verificationId}`, undefined, otherUserAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  dbTest("returns 404 for a valid but non-existent ObjectId", async () => {
    const res = await req("GET", `/v2/orderVerification/whatsapp-order-link/${NONEXISTENT_OBJECT_ID}`, undefined, adminAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("orderVerification.errors.notFound");
  });
});

describe("Traceability and failure handling", () => {
  test("handler returns 500 with requestId and writes a structured error log when DB init fails", async () => {
    const previousEnv = {
      NODE_ENV: process.env.NODE_ENV,
      MONGODB_URI: process.env.MONGODB_URI,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_BYPASS: process.env.JWT_BYPASS,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    };
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      process.env.NODE_ENV = "test";
      process.env.MONGODB_URI = MONGODB_URI || "mongodb://127.0.0.1:27017/orderverification-test";
      process.env.JWT_SECRET = JWT_SECRET;
      process.env.JWT_BYPASS = "false";
      process.env.ALLOWED_ORIGINS = OV_ENV.ALLOWED_ORIGINS || VALID_ORIGIN;

      jest.resetModules();
      jest.doMock("../functions/OrderVerification/src/config/db", () => ({
        getReadConnection: jest.fn(async () => {
          throw new Error("injected-db-failure");
        }),
      }));

      const { handleRequest } = require("../functions/OrderVerification/src/handler");
      const response = await handleRequest(
        {
          httpMethod: "GET",
          resource: "/v2/orderVerification/getAllOrders",
          path: "/v2/orderVerification/getAllOrders",
          pathParameters: null,
          queryStringParameters: null,
          headers: {
            Origin: VALID_ORIGIN,
            ...adminAuth(),
          },
          requestContext: {
            requestId: "apigw-request-id",
          },
        },
        {
          awsRequestId: "unit-500-request",
          callbackWaitsForEmptyEventLoop: true,
        }
      );

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.errorKey).toBe("common.internalError");
      expect(body.requestId).toBe("unit-500-request");

      const logEntry = consoleErrorSpy.mock.calls
        .map(([message]) => {
          try {
            return JSON.parse(message);
          } catch {
            return null;
          }
        })
        .find((entry) => entry?.message === "Unhandled request error");

      expect(logEntry).toBeDefined();
      expect(logEntry.scope).toBe("handler.handleRequest");
      expect(logEntry.request.requestId).toBe("apigw-request-id");
      expect(logEntry.error.message).toBe("injected-db-failure");
      expect(logEntry.extra.awsRequestId).toBe("unit-500-request");
    } finally {
      consoleErrorSpy.mockRestore();
      jest.resetModules();
      jest.dontMock("../functions/OrderVerification/src/config/db");

      Object.entries(previousEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });
});
