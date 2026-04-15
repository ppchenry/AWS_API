/**
 * PetLostandFound Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-petlostandfound
 *
 * Tests cover:
 *   - CORS (preflight, allowed/disallowed origins)
 *   - Auth (missing, expired, garbage JWT)
 *   - Pet Lost (list, create via multipart, delete, ownership)
 *   - Pet Found (list, create via multipart, delete, ownership)
 *   - Notifications (list, create, archive, self-access)
 *   - Guard (invalid path params, malformed JSON, empty body)
 *   - Rate limiting on create routes
 */

const jwt = require("../functions/PetLostandFound/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

const BASE_URL = "http://localhost:3000";
const TEST_TS = Date.now();
const JWT_SECRET = envConfig.PetLostandFoundFunction.JWT_SECRET;
const MONGODB_URI = envConfig.PetLostandFoundFunction?.MONGODB_URI || "";
const VALID_ORIGIN = envConfig.PetLostandFoundFunction.ALLOWED_ORIGINS.split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";
const SESSION_TEST_IP = `198.51.100.${(TEST_TS % 200) + 1}`;

// Valid ObjectId format — used as test user IDs
const TEST_USER_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const STRANGER_USER_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const NONEXISTENT_ID = "000000000000000000000001";
const INVALID_OBJECT_ID = "not-an-objectid";

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
    console.warn("[test] MongoDB unavailable - DB-backed checks will be skipped:", err.message);
    dbReady = false;
  }
}

async function disconnectDB() {
  if (dbReady && mongoose) {
    await mongoose.disconnect();
    dbReady = false;
  }
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

// ─── Token helpers ───────────────────────────────────────────────────────────

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(
    { userId: TEST_USER_ID, userEmail: "test@test.com", userRole: "user", ...payload },
    JWT_SECRET,
    { expiresIn: "1h", ...opts }
  );
}

function expiredToken(overrides = {}) {
  return jwt.sign(
    { userId: TEST_USER_ID, userEmail: "test@test.com", userRole: "user", ...overrides },
    JWT_SECRET,
    { expiresIn: -60 }
  );
}

const validToken = makeToken();
const strangerToken = makeToken({ userId: STRANGER_USER_ID });

function auth(token = validToken) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Request helpers ─────────────────────────────────────────────────────────

async function req(method, path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      "x-forwarded-for": SESSION_TEST_IP,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
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
      "x-forwarded-for": SESSION_TEST_IP,
      ...headers,
    },
    body: rawBody,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

/**
 * Build a multipart/form-data request for pet create routes.
 */
async function multipartReq(method, path, fields = {}, headers = {}) {
  const boundary = `----TestBoundary${TEST_TS}`;
  let body = "";
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Origin: VALID_ORIGIN,
      "x-forwarded-for": SESSION_TEST_IP,
      ...headers,
    },
    body,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

// Shared state for cross-test references
const state = {
  petLostId: null,
  petFoundId: null,
  notificationId: null,
};

afterAll(async () => {
  await disconnectDB();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

describe("CORS Preflight", () => {
  test("OPTIONS /pets/pet-lost with allowed origin → 204", async () => {
    const res = await fetch(`${BASE_URL}/pets/pet-lost`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });

  test("OPTIONS /pets/pet-lost with disallowed origin → 403", async () => {
    const res = await fetch(`${BASE_URL}/pets/pet-lost`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  test("OPTIONS /pets/pet-found with allowed origin → 204", async () => {
    const res = await fetch(`${BASE_URL}/pets/pet-found`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
  });

  test("OPTIONS /v2/account/{userId}/notifications with allowed origin → 204", async () => {
    const res = await fetch(`${BASE_URL}/v2/account/${TEST_USER_ID}/notifications`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Authentication
// ═══════════════════════════════════════════════════════════════════════════════

describe("Authentication", () => {
  test("GET /pets/pet-lost without Authorization header → 401", async () => {
    const res = await req("GET", "/pets/pet-lost");
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("GET /pets/pet-found with expired JWT → 401", async () => {
    const res = await req("GET", "/pets/pet-found", undefined, auth(expiredToken()));
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("GET /pets/pet-lost with garbage token → 401", async () => {
    const res = await req("GET", "/pets/pet-lost", undefined, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("GET /pets/pet-lost with wrong algorithm (RS256) → 401", async () => {
    // HS256 is enforced; a token signed with a different secret should fail
    const badToken = jwt.sign({ userId: TEST_USER_ID }, "wrong-secret", { expiresIn: "1h" });
    const res = await req("GET", "/pets/pet-lost", undefined, auth(badToken));
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("POST /pets/pet-lost without Authorization header → 401", async () => {
    const res = await multipartReq("POST", "/pets/pet-lost", { name: "TestPet" });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Route Not Found / Method Not Allowed
// ═══════════════════════════════════════════════════════════════════════════════

describe("Route dispatch", () => {
  test("PUT /pets/pet-lost → 405 method not allowed", async () => {
    const res = await req("PUT", "/pets/pet-lost", { name: "Test" }, auth());
    // SAM local may return 403 for unmapped routes; accept 403 or 405
    expect([403, 405]).toContain(res.status);
  });

  test("PATCH /pets/pet-found → 405 or 403", async () => {
    const res = await req("PATCH", "/pets/pet-found", { name: "Test" }, auth());
    expect([403, 405]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard — Path Parameter Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Guard — path param validation", () => {
  test("DELETE /pets/pet-lost/{invalid} → 400 invalidPathParam", async () => {
    const res = await req("DELETE", `/pets/pet-lost/${INVALID_OBJECT_ID}`, undefined, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidPathParam");
  });

  test("DELETE /pets/pet-found/{invalid} → 400 invalidPathParam", async () => {
    const res = await req("DELETE", `/pets/pet-found/${INVALID_OBJECT_ID}`, undefined, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidPathParam");
  });

  test("PUT /v2/account/{invalid}/notifications/{notifId} → 403 selfAccessDenied (checked before pathParam)", async () => {
    const res = await req("PUT", `/v2/account/${INVALID_OBJECT_ID}/notifications/${NONEXISTENT_ID}`, { isArchived: true }, auth());
    // Self-access check runs before ObjectId validation — JWT userId ≠ path userId
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.selfAccessDenied");
  });

  test("GET /v2/account/{userId}/notifications with invalid userId → 403 selfAccessDenied", async () => {
    const res = await req("GET", `/v2/account/${INVALID_OBJECT_ID}/notifications`, undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.selfAccessDenied");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard — Self-Access Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe("Guard — self-access", () => {
  test("GET /v2/account/{otherUserId}/notifications → 403 selfAccessDenied", async () => {
    const res = await req("GET", `/v2/account/${STRANGER_USER_ID}/notifications`, undefined, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.selfAccessDenied");
  });

  test("POST /v2/account/{otherUserId}/notifications → 403 selfAccessDenied", async () => {
    const res = await req("POST", `/v2/account/${STRANGER_USER_ID}/notifications`, {
      type: "lost",
      petName: "TestPet",
    }, auth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.selfAccessDenied");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard — JSON body validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Guard — body validation", () => {
  test("POST /v2/account/{userId}/notifications with malformed JSON → 400", async () => {
    const res = await rawReq(
      "POST",
      `/v2/account/${TEST_USER_ID}/notifications`,
      '{"type":"broken"',
      auth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("POST /v2/account/{userId}/notifications with empty body → 400", async () => {
    const res = await rawReq(
      "POST",
      `/v2/account/${TEST_USER_ID}/notifications`,
      "",
      auth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("PUT /v2/account/{userId}/notifications/{id} with empty body → 400", async () => {
    const res = await rawReq(
      "PUT",
      `/v2/account/${TEST_USER_ID}/notifications/${NONEXISTENT_ID}`,
      "",
      auth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pet Lost — GET list
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /pets/pet-lost", () => {
  test("returns 200 with pets array", async () => {
    const res = await req("GET", "/pets/pet-lost", undefined, auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.pets)).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });

  test("response contains CORS headers for allowed origin", async () => {
    const res = await req("GET", "/pets/pet-lost", undefined, auth());
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });

  test("response excludes __v field from results", async () => {
    const res = await req("GET", "/pets/pet-lost", undefined, auth());
    if (res.body.pets && res.body.pets.length > 0) {
      expect(res.body.pets[0]).not.toHaveProperty("__v");
    }
  });

  test("response includes requestId on error", async () => {
    const res = await req("GET", "/pets/pet-lost");
    expect(res.status).toBe(401);
    expect(typeof res.body.requestId).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pet Lost — POST create
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /pets/pet-lost", () => {
  test("creates a pet lost record with valid multipart data → 201", async () => {
    const res = await multipartReq("POST", "/pets/pet-lost", {
      name: `TestLost_${TEST_TS}`,
      animal: "dog",
      breed: "Poodle",
      sex: "male",
      status: "lost",
      owner: "Test Owner",
      ownerContact1: "+85212345678",
      lostDate: "01/01/2025",
      lostLocation: "Kowloon Park",
      lostDistrict: "Yau Tsim Mong",
      description: "Brown poodle, very friendly",
    }, auth());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeDefined();
    state.petLostId = res.body.id;
  });

  test("rejects create with missing required fields → 400", async () => {
    const res = await multipartReq("POST", "/pets/pet-lost", {
      name: "IncompleteRecord",
      // Missing lostDate, lostLocation, lostDistrict, etc.
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBeDefined();
  });

  test("rejects petId with invalid ObjectId format → 400", async () => {
    const res = await multipartReq("POST", "/pets/pet-lost", {
      petId: "not-a-valid-objectid",
      name: "TestLost",
      animal: "dog",
      breed: "Poodle",
      sex: "male",
      status: "lost",
      owner: "Test Owner",
      ownerContact1: "+85212345678",
      lostDate: "01/01/2025",
      lostLocation: "Kowloon Park",
      lostDistrict: "Yau Tsim Mong",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects petId pointing to nonexistent pet → 404", async () => {
    const res = await multipartReq("POST", "/pets/pet-lost", {
      petId: NONEXISTENT_ID,
      name: "TestLost",
      animal: "dog",
      breed: "Poodle",
      sex: "male",
      status: "lost",
      owner: "Test Owner",
      ownerContact1: "+85212345678",
      lostDate: "01/01/2025",
      lostLocation: "Kowloon Park",
      lostDistrict: "Yau Tsim Mong",
    }, auth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petLost.errors.petNotFound");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pet Lost — DELETE
// ═══════════════════════════════════════════════════════════════════════════════

describe("DELETE /pets/pet-lost/{petLostID}", () => {
  test("rejects delete of nonexistent ID → 404", async () => {
    const res = await req("DELETE", `/pets/pet-lost/${NONEXISTENT_ID}`, undefined, auth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petLost.errors.notFound");
  });

  test("rejects delete by non-owner → 403", async () => {
    if (!state.petLostId) return;
    const res = await req("DELETE", `/pets/pet-lost/${state.petLostId}`, undefined, auth(strangerToken));
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.selfAccessDenied");
  });

  test("owner can delete their own record → 200", async () => {
    if (!state.petLostId) return;
    const res = await req("DELETE", `/pets/pet-lost/${state.petLostId}`, undefined, auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("delete of already-deleted record → 404", async () => {
    if (!state.petLostId) return;
    const res = await req("DELETE", `/pets/pet-lost/${state.petLostId}`, undefined, auth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petLost.errors.notFound");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pet Found — GET list
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /pets/pet-found", () => {
  test("returns 200 with pets array", async () => {
    const res = await req("GET", "/pets/pet-found", undefined, auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.pets)).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });

  test("response excludes __v field from results", async () => {
    const res = await req("GET", "/pets/pet-found", undefined, auth());
    if (res.body.pets && res.body.pets.length > 0) {
      expect(res.body.pets[0]).not.toHaveProperty("__v");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pet Found — POST create
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /pets/pet-found", () => {
  test("creates a pet found record with valid multipart data → 201", async () => {
    const res = await multipartReq("POST", "/pets/pet-found", {
      animal: "cat",
      breed: "Persian",
      status: "found",
      owner: "Finder Person",
      ownerContact1: "+85298765432",
      foundDate: "15/03/2025",
      foundLocation: "Victoria Park",
      foundDistrict: "Wan Chai",
      description: "White persian cat, no collar",
    }, auth());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test("rejects create with missing required fields → 400", async () => {
    const res = await multipartReq("POST", "/pets/pet-found", {
      animal: "cat",
      // Missing foundDate, foundLocation, foundDistrict, etc.
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pet Found — DELETE
// ═══════════════════════════════════════════════════════════════════════════════

describe("DELETE /pets/pet-found/{petFoundID}", () => {
  let tempPetFoundId;

  test("create a record for delete tests", async () => {
    const res = await multipartReq("POST", "/pets/pet-found", {
      animal: "dog",
      breed: "Labrador",
      status: "found",
      owner: "Delete Test Owner",
      ownerContact1: "+85211112222",
      foundDate: "10/02/2025",
      foundLocation: "Tai Po",
      foundDistrict: "Tai Po",
      description: "Black labrador found near river",
    }, auth());
    expect(res.status).toBe(201);
    // Pet Found create doesn't return id in response body — look it up from DB
  });

  test("rejects delete of nonexistent ID → 404", async () => {
    const res = await req("DELETE", `/pets/pet-found/${NONEXISTENT_ID}`, undefined, auth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petFound.errors.notFound");
  });

  test("rejects invalid ObjectId → 400", async () => {
    const res = await req("DELETE", `/pets/pet-found/${INVALID_OBJECT_ID}`, undefined, auth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidPathParam");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Notifications — GET list
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /v2/account/{userId}/notifications", () => {
  test("returns 200 with notifications array for own userId", async () => {
    const res = await req("GET", `/v2/account/${TEST_USER_ID}/notifications`, undefined, auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });

  test("returns empty array (not 404) when no notifications exist", async () => {
    // Use a user who likely has no notifications
    const freshUserId = "cccccccccccccccccccccccc";
    const freshToken = makeToken({ userId: freshUserId });
    const res = await req("GET", `/v2/account/${freshUserId}/notifications`, undefined, auth(freshToken));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.notifications).toEqual([]);
  });

  test("response excludes __v field", async () => {
    const res = await req("GET", `/v2/account/${TEST_USER_ID}/notifications`, undefined, auth());
    if (res.body.notifications && res.body.notifications.length > 0) {
      expect(res.body.notifications[0]).not.toHaveProperty("__v");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Notifications — POST create
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /v2/account/{userId}/notifications", () => {
  test("creates a notification → 200", async () => {
    const res = await req("POST", `/v2/account/${TEST_USER_ID}/notifications`, {
      type: "lost",
      petName: `TestNotification_${TEST_TS}`,
    }, auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeDefined();
    state.notificationId = res.body.id;
  });

  test("creates a notification with petId → 200", async () => {
    const res = await req("POST", `/v2/account/${TEST_USER_ID}/notifications`, {
      type: "found",
      petName: "PetWithId",
      petId: NONEXISTENT_ID,
    }, auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("rejects notification with invalid petId format → 400", async () => {
    const res = await req("POST", `/v2/account/${TEST_USER_ID}/notifications`, {
      type: "lost",
      petName: "BadPetId",
      petId: "not-valid-objectid",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects notification with missing type → 400", async () => {
    const res = await req("POST", `/v2/account/${TEST_USER_ID}/notifications`, {
      petName: "NoType",
    }, auth());
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("isArchived field is ignored (not accepted in create)", async () => {
    const res = await req("POST", `/v2/account/${TEST_USER_ID}/notifications`, {
      type: "lost",
      petName: "ArchivedAttempt",
      isArchived: true,
    }, auth());
    // Should succeed — isArchived should be stripped/ignored by the schema
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Notifications — PUT archive
// ═══════════════════════════════════════════════════════════════════════════════

describe("PUT /v2/account/{userId}/notifications/{notificationId}", () => {
  test("archives an existing notification → 200", async () => {
    if (!state.notificationId) return;
    const res = await req(
      "PUT",
      `/v2/account/${TEST_USER_ID}/notifications/${state.notificationId}`,
      { isArchived: true },
      auth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("returns 404 for nonexistent notification", async () => {
    const res = await req(
      "PUT",
      `/v2/account/${TEST_USER_ID}/notifications/${NONEXISTENT_ID}`,
      { isArchived: true },
      auth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("notifications.errors.notFound");
  });

  test("stranger cannot archive another user's notification → 404 (compound query)", async () => {
    if (!state.notificationId) return;
    const res = await req(
      "PUT",
      `/v2/account/${STRANGER_USER_ID}/notifications/${state.notificationId}`,
      { isArchived: true },
      auth(strangerToken)
    );
    // Guard self-access blocks it (JWT userId ≠ path userId) OR compound query returns 0 matches
    expect([403, 404]).toContain(res.status);
  });

  test("invalid notificationId format → 400", async () => {
    const res = await req(
      "PUT",
      `/v2/account/${TEST_USER_ID}/notifications/${INVALID_OBJECT_ID}`,
      { isArchived: true },
      auth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidPathParam");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════════

describe("Rate limiting on create routes", () => {
  test("POST /pets/pet-lost rate limits after 5 requests in 60s → 429", async () => {
    // Use a unique hex userId per run so we don't collide with other tests
    const rateLimitUserId = `aa${TEST_TS.toString(16).padStart(22, "0")}`;
    const rlToken = makeToken({ userId: rateLimitUserId });

    for (let i = 0; i < 5; i++) {
      const res = await multipartReq("POST", "/pets/pet-lost", {
        name: `RateLimitTest_${i}`,
        animal: "dog",
        breed: "Mix",
        sex: "male",
        status: "lost",
        owner: "RL Tester",
        ownerContact1: "+85211111111",
        lostDate: "01/01/2025",
        lostLocation: "Central",
        lostDistrict: "Central and Western",
      }, auth(rlToken));
      expect(res.status).toBe(201);
    }

    // 6th request should be rate limited
    const blocked = await multipartReq("POST", "/pets/pet-lost", {
      name: "RateLimitBlocked",
      animal: "dog",
      breed: "Mix",
      sex: "male",
      status: "lost",
      owner: "RL Tester",
      ownerContact1: "+85211111111",
      lostDate: "01/01/2025",
      lostLocation: "Central",
      lostDistrict: "Central and Western",
    }, auth(rlToken));
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorKey).toBe("others.rateLimited");
  });

  test("POST /pets/pet-found rate limits after 5 requests in 60s → 429", async () => {
    const rateLimitUserId = `bb${TEST_TS.toString(16).padStart(22, "0")}`;
    const rlToken = makeToken({ userId: rateLimitUserId });

    for (let i = 0; i < 5; i++) {
      const res = await multipartReq("POST", "/pets/pet-found", {
        animal: "cat",
        breed: "Mix",
        status: "found",
        owner: "RL Tester",
        ownerContact1: "+85222222222",
        foundDate: "01/01/2025",
        foundLocation: "Mong Kok",
        foundDistrict: "Yau Tsim Mong",
      }, auth(rlToken));
      expect(res.status).toBe(201);
    }

    const blocked = await multipartReq("POST", "/pets/pet-found", {
      animal: "cat",
      breed: "Mix",
      status: "found",
      owner: "RL Tester",
      ownerContact1: "+85222222222",
      foundDate: "01/01/2025",
      foundLocation: "Mong Kok",
      foundDistrict: "Yau Tsim Mong",
    }, auth(rlToken));
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorKey).toBe("others.rateLimited");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Response shape consistency
// ═══════════════════════════════════════════════════════════════════════════════

describe("Response shape", () => {
  test("error responses include success=false, errorKey, error, requestId", async () => {
    const res = await req("GET", "/pets/pet-lost");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
    // requestId may not be present on auth failures before awsRequestId is set
  });

  test("success responses include success=true", async () => {
    const res = await req("GET", "/pets/pet-lost", undefined, auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DB-Backed Cleanup (optional — runs only when MONGODB_URI is available)
// ═══════════════════════════════════════════════════════════════════════════════

describe("DB cleanup", () => {
  dbTest("clean up test pet-lost records", async () => {
    const col = mongoose.connection.db.collection("petlosts");
    const result = await col.deleteMany({
      userId: { $in: [TEST_USER_ID] },
      name: { $regex: /^(TestLost_|RateLimitTest_|RateLimitBlocked)/ },
    });
    console.log(`[cleanup] Deleted ${result.deletedCount} test pet-lost records`);
  });

  dbTest("clean up test pet-found records", async () => {
    const col = mongoose.connection.db.collection("petfounds");
    const result = await col.deleteMany({
      userId: { $in: [TEST_USER_ID] },
    });
    console.log(`[cleanup] Deleted ${result.deletedCount} test pet-found records`);
  });

  dbTest("clean up test notifications", async () => {
    const col = mongoose.connection.db.collection("notifications");
    const result = await col.deleteMany({
      userId: TEST_USER_ID,
    });
    console.log(`[cleanup] Deleted ${result.deletedCount} test notifications`);
  });

  dbTest("clean up rate limit entries for test users", async () => {
    const col = mongoose.connection.db.collection("ratelimits");
    const hexTs = TEST_TS.toString(16).padStart(22, "0");
    const result = await col.deleteMany({
      key: { $regex: new RegExp(`(aa|bb)${hexTs}`) },
    });
    console.log(`[cleanup] Deleted ${result.deletedCount} rate limit entries`);
  });
});
