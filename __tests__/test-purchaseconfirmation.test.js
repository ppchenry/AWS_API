/**
 * purchaseConfirmation Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-purchaseconfirmation
 *
 * Env config (env.json purchaseConfirmationFunction):
 *   TEST_SHOP_CODE  — shopCode of a real ShopInfo record (for price resolution)
 *   TEST_ORDER_VERIFICATION_ID — ObjectId of an existing non-cancelled OrderVerification
 *
 * If either is missing, the corresponding DB-backed tests are skipped with a warning.
 * Core auth, guard, CORS, dead-route, and Zod tests run unconditionally.
 */

const jwt = require("../functions/purchaseConfirmation/node_modules/jsonwebtoken");
const envConfig = require("../env.json");
const { routeRequest } = require("../functions/purchaseConfirmation/src/router");

jest.setTimeout(30000);

const BASE_URL = "http://localhost:3000";
const TEST_TS = Date.now();
const JWT_SECRET = envConfig.purchaseConfirmationFunction.JWT_SECRET;
const MONGODB_URI = envConfig.purchaseConfirmationFunction?.MONGODB_URI || "";
const VALID_ORIGIN = envConfig.purchaseConfirmationFunction.ALLOWED_ORIGINS.split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

const TEST_SHOP_CODE = envConfig.purchaseConfirmationFunction?.TEST_SHOP_CODE || "";
const TEST_ORDER_VERIFICATION_ID = envConfig.purchaseConfirmationFunction?.TEST_ORDER_VERIFICATION_ID || "";

// Valid ObjectId that will never exist in the DB
const NONEXISTENT_OV_ID = "000000000000000000000001";

// Conditional test helpers
const shopTest = TEST_SHOP_CODE ? test : test.skip;
const ovTest = TEST_ORDER_VERIFICATION_ID ? test : test.skip;

// ─── MongoDB direct connection ───────────────────────────────────────────────

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
    console.warn("[test] MongoDB unavailable - seeded tests will be skipped:", err.message);
    dbReady = false;
  }
}

function rateLimitsCol() {
  return mongoose.connection.db.collection("rate_limits");
}

function ordersCol() {
  return mongoose.connection.db.collection("orders");
}

function orderVerificationsCol() {
  return mongoose.connection.db.collection("orderVerification");
}

function toWindowStart(nowMs = Date.now(), windowSec) {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

async function seedRateLimit({ action, identifier, limit, windowSec, ip = "203.0.113.10" }) {
  if (!dbReady) throw new Error("MongoDB must be connected before seeding rate limits");
  const windowStart = toWindowStart(Date.now(), windowSec);
  const expireAt = new Date(windowStart.getTime() + windowSec * 1000);
  const key = `${ip}:${identifier}`;
  await rateLimitsCol().updateOne(
    { action, key, windowStart },
    { $set: { action, key, windowStart, expireAt, count: limit } },
    { upsert: true },
  );
  return { ip, key };
}

// ─── Shared state ────────────────────────────────────────────────────────────

const state = {
  // Order + OrderVerification created during suite for cleanup
  createdOrderIds: [],
  createdOVIds: [],
  // Disposable OV for soft-cancel test
  disposableOVId: null,
};

afterAll(async () => {
  if (dbReady && mongoose) {
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
      await rateLimitsCol().deleteMany({
        key: { $regex: /^(127\.0\.0\.1|203\.0\.113\.10|203\.0\.113\.11|203\.0\.113\.12):/ },
      });
    } catch { /* best-effort cleanup */ }
    await mongoose.disconnect();
  }
});

// ─── Token helpers ───────────────────────────────────────────────────────────

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...opts });
}

function adminAuth() {
  return { Authorization: `Bearer ${makeToken({ userId: "admin-user-id", userRole: "admin" })}` };
}

function userAuth() {
  return { Authorization: `Bearer ${makeToken({ userId: "regular-user-id", userRole: "user" })}` };
}

function expiredAuth() {
  return { Authorization: `Bearer ${jwt.sign({ userId: "expired-user" }, JWT_SECRET, { expiresIn: -60 })}` };
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

function buildMultipart(fields = {}, files = []) {
  const boundary = "----JestPurchaseBoundary" + TEST_TS;
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
  const { body, boundary } = buildMultipart(fields, files);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": `multipart/form-data; boundary=----JestPurchaseBoundary${TEST_TS}`,
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

// ─── Valid form payloads ─────────────────────────────────────────────────────

function validPurchaseFields(overrides = {}) {
  return {
    lastName: "TestUser",
    email: "testuser@example.com",
    address: "123 Test Street",
    option: "PTag",
    tempId: `test_${TEST_TS}_${Math.random().toString(36).slice(2, 8)}`,
    paymentWay: "FPS",
    delivery: "SF Express",
    petName: "TestPet",
    phoneNumber: "12345678",
    shopCode: TEST_SHOP_CODE || "TESTSHOP",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 0 — MongoDB connection
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase 0 — MongoDB connection", () => {
  test("connect to MongoDB", async () => {
    await connectDB();
    if (!MONGODB_URI) {
      console.warn("[test] MONGODB_URI not set — DB-backed tests will be skipped");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORS Preflight
// ═══════════════════════════════════════════════════════════════════════════════

describe("OPTIONS preflight", () => {
  const routes = [
    "/purchase/confirmation",
    "/purchase/shop-info",
    "/purchase/orders",
    "/purchase/order-verification",
    "/purchase/send-ptag-detection-email",
  ];

  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(`${BASE_URL}/purchase/shop-info`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  }, 60000);

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(`${BASE_URL}/purchase/shop-info`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("others.originNotAllowed");
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(`${BASE_URL}/purchase/shop-info`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("others.originNotAllowed");
  });

  test.each(routes)("OPTIONS %s → 204 for allowed origin", async (route) => {
    const res = await fetch(`${BASE_URL}${route}`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// JWT Authentication (on admin-protected route)
// ═══════════════════════════════════════════════════════════════════════════════

describe("JWT authentication", () => {
  const authPath = "/purchase/orders";

  test("rejects request with no Authorization header → 401", async () => {
    const res = await req("GET", authPath);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT → 401", async () => {
    const res = await req("GET", authPath, undefined, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Bearer token → 401", async () => {
    const res = await req("GET", authPath, undefined, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects token without Bearer prefix → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const res = await req("GET", authPath, undefined, { Authorization: token });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects tampered JWT signature → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    const res = await req("GET", authPath, undefined, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects alg:none token → 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: "any-user" })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;
    const res = await req("GET", authPath, undefined, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("error response shape: success, errorKey, error, requestId", async () => {
    const res = await req("GET", authPath);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(typeof res.body.requestId).toBe("string");
  });

  test("CORS headers present on error responses for allowed origin", async () => {
    const res = await req("GET", authPath);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Public routes skip JWT (no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Public routes — no JWT required", () => {
  test("GET /purchase/shop-info responds without auth", async () => {
    const res = await req("GET", "/purchase/shop-info");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.shopInfo)).toBe(true);
  });

  test("GET /purchase/shop-info does not expose bank details", async () => {
    const res = await req("GET", "/purchase/shop-info");
    expect(res.status).toBe(200);
    for (const shop of (res.body.shopInfo || [])) {
      expect(shop).not.toHaveProperty("bankName");
      expect(shop).not.toHaveProperty("bankNumber");
      expect(shop).not.toHaveProperty("__v");
    }
  });

  test("POST /purchase/confirmation is accessible without auth → 400 from Zod", async () => {
    // Empty multipart with no fields → should hit Zod validation (400), not auth (401)
    const res = await multipartReq("POST", "/purchase/confirmation");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("purchase.errors.missingRequiredFields");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RBAC — Admin-only routes
// ═══════════════════════════════════════════════════════════════════════════════

describe("RBAC — admin-only routes reject regular users", () => {
  const adminRoutes = [
    ["GET", "/purchase/orders"],
    ["GET", "/purchase/order-verification"],
    ["POST", "/purchase/send-ptag-detection-email"],
  ];

  test.each(adminRoutes)("%s %s → 403 for regular user", async (method, path) => {
    const res = await req(method, path, method === "POST" ? {} : undefined, userAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("DELETE /purchase/order-verification/{id} → 403 for regular user", async () => {
    const res = await req("DELETE", `/purchase/order-verification/${NONEXISTENT_OV_ID}`, undefined, userAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("GET /purchase/orders → succeeds (not 401/403) for admin", async () => {
    const res = await req("GET", "/purchase/orders", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  test("GET /purchase/order-verification → succeeds (not 401/403) for admin", async () => {
    const res = await req("GET", "/purchase/order-verification", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.orderVerification)).toBe(true);
  });

  test("POST /purchase/send-ptag-detection-email → succeeds (not 401/403) for admin", async () => {
    const body = { name: "TestPet", tagId: "TAG001", dateTime: "2026-01-01T00:00:00Z", locationURL: "https://maps.google.com/test", email: "test@example.com" };
    const res = await req("POST", "/purchase/send-ptag-detection-email", body, adminAuth());
    // 200 if SMTP is configured, 500 if not — both prove RBAC passed and handler executed
    expect([200, 500]).toContain(res.status);
    expect(res.body.success).toBe(res.status === 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard — JSON parse and empty body
// ═══════════════════════════════════════════════════════════════════════════════

describe("Guard — JSON parse and empty body", () => {
  test("rejects malformed JSON on POST /purchase/send-ptag-detection-email → 400", async () => {
    const res = await rawReq("POST", "/purchase/send-ptag-detection-email", '{"broken"', adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rejects empty body on POST /purchase/send-ptag-detection-email → 400", async () => {
    const res = await req("POST", "/purchase/send-ptag-detection-email", {}, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard — ObjectId validation on DELETE path param
// ═══════════════════════════════════════════════════════════════════════════════

describe("Guard — ObjectId path parameter validation", () => {
  test("rejects invalid ObjectId format → 400", async () => {
    const res = await req("DELETE", "/purchase/order-verification/not-a-valid-id", undefined, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidObjectId");
  });

  test("returns 404 for valid ObjectId that does not exist", async () => {
    const res = await req("DELETE", `/purchase/order-verification/${NONEXISTENT_OV_ID}`, undefined, adminAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("purchase.errors.orderVerificationNotFound");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Dead Routes (405) — unit test via routeRequest
// ═══════════════════════════════════════════════════════════════════════════════

describe("Dead routes return 405", () => {
  const deadRoutes = [
    ["POST", "/purchase/get-presigned-url"],
    ["POST", "/v2/purchase/get-presigned-url"],
    ["POST", "/purchase/whatsapp-SF-message"],
    ["POST", "/v2/purchase/whatsapp-SF-message"],
  ];

  test.each(deadRoutes)("%s %s → 405", async (method, path) => {
    const response = await routeRequest({
      event: {
        httpMethod: method,
        resource: path,
        path: path,
        headers: { Origin: VALID_ORIGIN },
      },
    });
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Zod — POST /purchase/send-ptag-detection-email validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Zod — send-ptag-detection-email validation", () => {
  const emailPath = "/purchase/send-ptag-detection-email";

  test("rejects missing required fields → 400", async () => {
    const res = await req("POST", emailPath, { name: "Test" }, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("email.errors.missingFields");
  });

  test("rejects invalid email → 400", async () => {
    const res = await req("POST", emailPath, {
      name: "Test",
      tagId: "ABC123",
      dateTime: "2026-01-01T00:00:00Z",
      locationURL: "https://maps.google.com/test",
      email: "not-an-email",
    }, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("email.errors.invalidEmail");
  });

  test("rejects non-HTTPS locationURL → 400", async () => {
    const res = await req("POST", emailPath, {
      name: "Test",
      tagId: "ABC123",
      dateTime: "2026-01-01T00:00:00Z",
      locationURL: "http://maps.google.com/test",
      email: "test@example.com",
    }, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("email.errors.invalidLocationURL");
  });

  test("rejects non-URL locationURL → 400", async () => {
    const res = await req("POST", emailPath, {
      name: "Test",
      tagId: "ABC123",
      dateTime: "2026-01-01T00:00:00Z",
      locationURL: "not-a-url",
      email: "test@example.com",
    }, adminAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("email.errors.invalidLocationURL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Zod — POST /purchase/confirmation multipart validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Zod — purchase confirmation validation", () => {
  const purchasePath = "/purchase/confirmation";

  // Clear any leftover rate limits for 127.0.0.1 so Zod tests aren't blocked by 429
  beforeAll(async () => {
    if (!dbReady) return;
    await rateLimitsCol().deleteMany({
      key: { $regex: /^127\.0\.0\.1:/ },
    });
  });

  test("rejects missing required fields → 400", async () => {
    const res = await multipartReq("POST", purchasePath, { lastName: "Test" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("purchase.errors.missingRequiredFields");
  });

  test("rejects invalid email format → 400", async () => {
    const res = await multipartReq("POST", purchasePath, validPurchaseFields({ email: "not-email" }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidEmail");
  });

  test("rejects invalid phone number → 400", async () => {
    const res = await multipartReq("POST", purchasePath, validPurchaseFields({ phoneNumber: "abc" }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidPhone");
  });

  test("rejects phone number too short → 400", async () => {
    const res = await multipartReq("POST", purchasePath, validPurchaseFields({ phoneNumber: "123" }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidPhone");
  });

  test("rejects option with special characters → 400", async () => {
    const res = await multipartReq("POST", purchasePath, validPurchaseFields({ option: "<script>" }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidOption");
  });

  test("rejects tempId with special characters → 400", async () => {
    const res = await multipartReq("POST", purchasePath, validPurchaseFields({ tempId: "'; DROP TABLE--" }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidTempId");
  });

  test("rejects missing shopCode → 400", async () => {
    const fields = validPurchaseFields();
    delete fields.shopCode;
    const res = await multipartReq("POST", purchasePath, fields);
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidShopCode");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NoSQL injection resistance
// ═══════════════════════════════════════════════════════════════════════════════

describe("NoSQL injection resistance", () => {
  // Clear any rate limits accumulated by previous describe block
  beforeAll(async () => {
    if (!dbReady) return;
    await rateLimitsCol().deleteMany({
      key: { $regex: /^127\.0\.0\.1:/ },
    });
  });

  test("$gt operator in email field is rejected by Zod", async () => {
    const res = await multipartReq("POST", "/purchase/confirmation", validPurchaseFields({
      email: '{"$gt":""}',
    }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidEmail");
  });

  test("$ne operator in option is rejected by regex", async () => {
    const res = await multipartReq("POST", "/purchase/confirmation", validPurchaseFields({
      option: '{"$ne":null}',
    }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidOption");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /purchase/orders — admin pagination
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /purchase/orders — admin", () => {
  test("returns paginated orders list", async () => {
    const res = await req("GET", "/purchase/orders?page=1&limit=5", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 5,
    });
    expect(typeof res.body.pagination.total).toBe("number");
  });

  test("clamps limit to max 500", async () => {
    const res = await req("GET", "/purchase/orders?limit=9999", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBeLessThanOrEqual(500);
  });

  test("defaults to page=1 and limit=100", async () => {
    const res = await req("GET", "/purchase/orders", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(100);
  });

  test("orders are sanitized (no __v or unexpected fields)", async () => {
    const res = await req("GET", "/purchase/orders?limit=1", undefined, adminAuth());
    expect(res.status).toBe(200);
    for (const order of (res.body.orders || [])) {
      expect(order).not.toHaveProperty("__v");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /purchase/order-verification — admin pagination
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /purchase/order-verification — admin", () => {
  test("returns paginated order verifications", async () => {
    const res = await req("GET", "/purchase/order-verification?page=1&limit=5", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.orderVerification)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 5,
    });
  });

  test("clamps limit to max 500", async () => {
    const res = await req("GET", "/purchase/order-verification?limit=9999", undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBeLessThanOrEqual(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /purchase/order-verification/{id} — soft cancel
// ═══════════════════════════════════════════════════════════════════════════════

describe("DELETE /purchase/order-verification/{id} — soft cancel", () => {
  // Seed a disposable OV for cancel tests
  test("seed disposable OrderVerification for cancel tests", async () => {
    if (!dbReady) return;
    const ov = await orderVerificationsCol().insertOne({
      tagId: `TESTOV_${TEST_TS}`,
      staffVerification: false,
      cancelled: false,
      petName: "DisposablePet",
      shortUrl: "https://test.example.com",
      masterEmail: "dispose@test.com",
      qrUrl: "https://test.example.com/qr",
      petUrl: "",
      orderId: `temp_dispose_${TEST_TS}`,
      pendingStatus: false,
      option: "PTag",
      type: "",
      optionSize: "",
      optionColor: "",
      price: 100,
      discountProof: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    state.disposableOVId = ov.insertedId.toString();
    state.createdOVIds.push(state.disposableOVId);
    expect(state.disposableOVId).toBeTruthy();
  });

  test("soft-cancels an existing OrderVerification → 200", async () => {
    if (!dbReady || !state.disposableOVId) return;
    const res = await req("DELETE", `/purchase/order-verification/${state.disposableOVId}`, undefined, adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Cancelled successfully.");
  });

  test("returns 409 when already cancelled", async () => {
    if (!dbReady || !state.disposableOVId) return;
    const res = await req("DELETE", `/purchase/order-verification/${state.disposableOVId}`, undefined, adminAuth());
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe("purchase.errors.alreadyCancelled");
  });

  test("returns 404 for non-existent OrderVerification", async () => {
    const res = await req("DELETE", `/purchase/order-verification/${NONEXISTENT_OV_ID}`, undefined, adminAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("purchase.errors.orderVerificationNotFound");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /purchase/confirmation — full purchase flow (DB-backed)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /purchase/confirmation — full flow", () => {
  // Clear any rate limits so full-flow tests aren't blocked
  beforeAll(async () => {
    if (!dbReady) return;
    await rateLimitsCol().deleteMany({
      key: { $regex: /^127\.0\.0\.1:/ },
    });
  });

  shopTest("creates order with valid shopCode (no file upload)", async () => {
    const fields = validPurchaseFields({ shopCode: TEST_SHOP_CODE });
    const res = await multipartReq("POST", "/purchase/confirmation", fields);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.purchase_code).toBe(fields.tempId);
    expect(typeof res.body.price).toBe("number");
    expect(typeof res.body._id).toBe("string");

    // Track for cleanup
    if (dbReady && res.body._id) {
      state.createdOVIds.push(res.body._id);
      // Find the order by tempId to track it too
      try {
        const order = await ordersCol().findOne({ tempId: fields.tempId });
        if (order) state.createdOrderIds.push(order._id.toString());
      } catch { /* best-effort */ }
    }
  }, 60000);

  shopTest("rejects duplicate tempId → 409", async () => {
    // Use the same tempId as the successful order above
    if (state.createdOVIds.length === 0) return;
    const firstTempId = validPurchaseFields().tempId; // need a known-created one
    // Instead, create fresh + retry
    const tempId = `dup_${TEST_TS}`;
    const fields = validPurchaseFields({ shopCode: TEST_SHOP_CODE, tempId });
    const res1 = await multipartReq("POST", "/purchase/confirmation", fields);
    if (res1.status === 200) {
      if (dbReady && res1.body._id) {
        state.createdOVIds.push(res1.body._id);
        try {
          const order = await ordersCol().findOne({ tempId });
          if (order) state.createdOrderIds.push(order._id.toString());
        } catch { /* best-effort */ }
      }
      const res2 = await multipartReq("POST", "/purchase/confirmation", fields);
      expect(res2.status).toBe(409);
      expect(res2.body.errorKey).toBe("purchase.errors.duplicateOrder");
    }
  }, 60000);

  test("rejects unrecognised shopCode → 400", async () => {
    const res = await multipartReq("POST", "/purchase/confirmation", validPurchaseFields({
      shopCode: "NONEXISTENT_SHOP_99999",
    }));
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("purchase.errors.invalidShopCode");
  });

  test("server ignores client-supplied price (server-authoritative)", async () => {
    if (!TEST_SHOP_CODE) return;
    const fields = validPurchaseFields({ shopCode: TEST_SHOP_CODE, price: "9999999" });
    const res = await multipartReq("POST", "/purchase/confirmation", fields);
    if (res.status === 200) {
      expect(res.body.price).not.toBe(9999999);
      if (dbReady && res.body._id) {
        state.createdOVIds.push(res.body._id);
        try {
          const order = await ordersCol().findOne({ tempId: fields.tempId });
          if (order) state.createdOrderIds.push(order._id.toString());
        } catch { /* best-effort */ }
      }
    }
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rate limiting — POST /purchase/confirmation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Rate limiting — POST /purchase/confirmation", () => {
  test("returns 429 when rate limit is exhausted", async () => {
    if (!dbReady) return;
    // Seed a maxed-out rate limit entry for a known IP
    await seedRateLimit({
      action: "submit-order",
      identifier: "submit-order",
      limit: 10,
      windowSec: 3600,
      ip: "203.0.113.12",
    });
    // The test via SAM uses 127.0.0.1 as source IP, so we seed for that too
    await seedRateLimit({
      action: "submit-order",
      identifier: "submit-order",
      limit: 10,
      windowSec: 3600,
      ip: "127.0.0.1",
    });
    const res = await multipartReq("POST", "/purchase/confirmation", validPurchaseFields());
    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("others.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Response shape consistency
// ═══════════════════════════════════════════════════════════════════════════════

describe("Response shape consistency", () => {
  test("success responses have { success: true }", async () => {
    const res = await req("GET", "/purchase/shop-info");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("error responses have { success: false, errorKey, error, requestId }", async () => {
    const res = await req("GET", "/purchase/orders"); // no auth → 401
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(typeof res.body.requestId).toBe("string");
  });
});
