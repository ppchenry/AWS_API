/**
 * PetBasicInfo Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-petbasicinfo
 *
 * Pet-specific tests (GET success, PUT validation, eyeLog, ownership) require:
 *   env.json PetBasicInfoFunction.TEST_PET_ID       — ObjectId of a live pet in the UAT DB
 *   env.json PetBasicInfoFunction.TEST_OWNER_USER_ID — userId that owns TEST_PET_ID
 *
 * Tests that only need auth shape, pet ID format, or body validation run against
 * NONEXISTENT_PET_ID (valid ObjectId format, guaranteed absent from DB) and do not
 * require either config value.
 */

const jwt = require("../functions/PetBasicInfo/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

// SAM cold-start can exceed the Jest default 5 s. Allow 15 s per test.
jest.setTimeout(15000);

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = envConfig.PetBasicInfoFunction.JWT_SECRET;
const VALID_ORIGIN = envConfig.PetBasicInfoFunction.ALLOWED_ORIGINS.split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

// Valid ObjectId format that will never exist in the DB
const NONEXISTENT_PET_ID = "000000000000000000000001";

const TEST_PET_ID = envConfig.PetBasicInfoFunction?.TEST_PET_ID || "";
const TEST_OWNER_USER_ID = envConfig.PetBasicInfoFunction?.TEST_OWNER_USER_ID || "";

// Skip pet-specific tests when no test pet is configured in env.json
const petTest = TEST_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;

// A second, separate pet that can be permanently deleted by the lifecycle test.
// Set TEST_DISPOSABLE_PET_ID in env.json PetBasicInfoFunction to a pet owned by
// TEST_OWNER_USER_ID that you are willing to soft-delete. Leave empty to skip.
const DISPOSABLE_PET_ID = envConfig.PetBasicInfoFunction?.TEST_DISPOSABLE_PET_ID || "";
const disposableTest = DISPOSABLE_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;

// ─── Token helpers ───────────────────────────────────────────────────────────

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...opts });
}

const ownerToken = TEST_OWNER_USER_ID ? makeToken({ userId: TEST_OWNER_USER_ID }) : "";
// A token for a user who does not own the test pet
const strangerToken = makeToken({ userId: "000000000000000000000002" });

function ownerAuth() {
  return { Authorization: `Bearer ${ownerToken}` };
}
function strangerAuth() {
  return { Authorization: `Bearer ${strangerToken}` };
}
function expiredAuth() {
  const token = jwt.sign(
    { userId: TEST_OWNER_USER_ID || "expired-user" },
    JWT_SECRET,
    { expiresIn: -60 }
  );
  return { Authorization: `Bearer ${token}` };
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

// ─── CORS Preflight ──────────────────────────────────────────────────────────

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(`${BASE_URL}/pets/${NONEXISTENT_PET_ID}/basic-info`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(`${BASE_URL}/pets/${NONEXISTENT_PET_ID}/basic-info`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(`${BASE_URL}/pets/${NONEXISTENT_PET_ID}/basic-info`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(403);
  });
});

// ─── JWT Authentication ──────────────────────────────────────────────────────

describe("JWT authentication", () => {
  test("rejects request with no Authorization header → 401", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT → 401", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`, undefined, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Bearer token → 401", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`, undefined, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects token without Bearer prefix → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`, undefined, {
      Authorization: token,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects tampered JWT signature → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`, undefined, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects alg:none token → 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: "any-user" })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`, undefined, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("error responses include success:false, errorKey, error string, and requestId", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(typeof res.body.requestId).toBe("string");
  });
});

// ─── Pet ID Validation ───────────────────────────────────────────────────────

describe("Pet ID validation", () => {
  test("rejects invalid petID format → 400", async () => {
    const res = await req("GET", "/pets/not-a-valid-id/basic-info", undefined, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.invalidPetIdFormat");
  });

  test("returns 404 for valid-format but nonexistent petID", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/basic-info`, undefined, strangerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.petNotFound");
  });
});

// ─── Ownership Access Control ────────────────────────────────────────────────

describe("Ownership access control", () => {
  petTest("GET returns 403 for a stranger JWT on another user's pet", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/basic-info`, undefined, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  petTest("PUT returns 403 for a stranger JWT on another user's pet", async () => {
    const res = await req("PUT", `/pets/${TEST_PET_ID}/basic-info`, { name: "Hijacked" }, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });
});

// ─── GET /pets/{petID}/basic-info ────────────────────────────────────────────

describe("GET /pets/{petID}/basic-info", () => {
  petTest("returns 200 with form and id", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/basic-info`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.form).toBeDefined();
    expect(res.body.id).toBeDefined();
  });

  petTest("response does not leak deleted, __v, or other internal fields", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/basic-info`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.form.deleted).toBeUndefined();
    expect(res.body.form.__v).toBeUndefined();
    expect(res.body.form.password).toBeUndefined();
  });

  petTest("response includes CORS allow-origin header", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/basic-info`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });

  petTest("top-level id matches the requested petID; form does not contain _id", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/basic-info`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    // The sanitize allowlist does not include _id; identifier is carried at top level only.
    expect(String(res.body.id)).toBe(TEST_PET_ID);
    expect(res.body.form._id).toBeUndefined();
  });

  petTest("sanitized form includes allowed fields (positive allowlist check)", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/basic-info`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    // At least name and animal must be present in any real pet document.
    expect(res.body.form).toHaveProperty("name");
    expect(res.body.form).toHaveProperty("animal");
  });
});

// ─── PUT /pets/{petID}/basic-info ────────────────────────────────────────────

describe("PUT /pets/{petID}/basic-info — body validation", () => {
  // Body parse and empty-body checks run inside the guard before the DB lookup,
  // so NONEXISTENT_PET_ID is sufficient for these two tests.
  test("rejects malformed JSON body → 400", async () => {
    const res = await rawReq(
      "PUT",
      `/pets/${NONEXISTENT_PET_ID}/basic-info`,
      '{"name":"broken"',
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.invalidJSON");
  });

  test("rejects empty body → 400", async () => {
    const res = await req("PUT", `/pets/${NONEXISTENT_PET_ID}/basic-info`, {}, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.emptyUpdateBody");
  });

  // The following tests require a real pet because Zod validation runs in the
  // service after the guard passes the fetched pet document.
  petTest("rejects invalid weight type (string instead of number) → 400", async () => {
    const res = await req("PUT", `/pets/${TEST_PET_ID}/basic-info`, { weight: "heavy" }, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.invalidWeightType");
  });

  petTest("rejects unknown field (strict schema) → 400", async () => {
    const res = await req("PUT", `/pets/${TEST_PET_ID}/basic-info`, { unknownField: "value" }, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.invalidUpdateField");
  });

  petTest("rejects tagId in body (blocked by strict schema) → 400", async () => {
    const res = await req("PUT", `/pets/${TEST_PET_ID}/basic-info`, { tagId: "tag-001" }, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.invalidUpdateField");
  });

  petTest("rejects invalid date format for birthday → 400", async () => {
    const res = await req("PUT", `/pets/${TEST_PET_ID}/basic-info`, { birthday: "not-a-date" }, ownerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.invalidBirthdayFormat");
  });

  petTest("accepts a valid name update → 200", async () => {
    const res = await req("PUT", `/pets/${TEST_PET_ID}/basic-info`, { name: "IntegrationTestName" }, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(String(res.body.id)).toBe(TEST_PET_ID);
    expect(res.body.message).toBe("petBasicInfo.success.updatedSuccessfully");
  });
});

// ─── GET /pets/{petID}/eyeLog ────────────────────────────────────────────────

describe("GET /pets/{petID}/eyeLog", () => {
  test("rejects no auth → 401", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/eyeLog`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  petTest("returns 200 with result as an array scoped to the requested petID", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/eyeLog`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.result)).toBe(true);
    // Every returned record must belong to the requested pet, not to an arbitrary pet.
    res.body.result.forEach((record) => {
      expect(String(record.petId)).toBe(TEST_PET_ID);
    });
  });

  petTest("result items contain _id and petId fields", async () => {
    const res = await req("GET", `/pets/${TEST_PET_ID}/eyeLog`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    if (res.body.result.length > 0) {
      const first = res.body.result[0];
      expect(first._id).toBeDefined();
      expect(first.petId).toBeDefined();
    }
  });
});

// ─── DELETE /pets/{petID} ────────────────────────────────────────────────────

describe("DELETE /pets/{petID}", () => {
  test("rejects no auth → 401", async () => {
    const res = await req("DELETE", `/pets/${NONEXISTENT_PET_ID}`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects invalid petID format → 400", async () => {
    const res = await req("DELETE", "/pets/not-a-valid-id", undefined, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.invalidPetIdFormat");
  });

  test("returns 404 for nonexistent petID with valid format", async () => {
    const res = await req("DELETE", `/pets/${NONEXISTENT_PET_ID}`, undefined, strangerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.petNotFound");
  });

  test("returns 429 after rate limit is exceeded → 429", async () => {
    // Use a unique userId per run so parallel or repeated test runs don't share quota.
    const rlToken = makeToken({ userId: `rl-test-${Date.now()}` });
    const rlAuth = { Authorization: `Bearer ${rlToken}` };
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await req("DELETE", `/pets/${NONEXISTENT_PET_ID}`, undefined, rlAuth);
      if (res.status === 429) {
        expect(res.body.errorKey).toBe("others.rateLimited");
        got429 = true;
        break;
      }
      // Before limit is hit, the guard returns 404 (pet doesn't exist).
      expect(res.status).toBe(404);
    }
    expect(got429).toBe(true);
  });

  petTest("returns 403 for a stranger JWT on another user's pet", async () => {
    const res = await req("DELETE", `/pets/${TEST_PET_ID}`, undefined, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  disposableTest("owner can soft-delete own pet → 200; subsequent GET returns 404", async () => {
    const del = await req("DELETE", `/pets/${DISPOSABLE_PET_ID}`, undefined, ownerAuth());
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    expect(String(del.body.petId)).toBe(DISPOSABLE_PET_ID);

    // Guard returns uniform 404 for both missing and soft-deleted pets.
    const get = await req("GET", `/pets/${DISPOSABLE_PET_ID}/basic-info`, undefined, ownerAuth());
    expect(get.status).toBe(404);
    expect(get.body.errorKey).toBe("petBasicInfo.errors.petNotFound");
  });
});

// ─── Coverage Gate ───────────────────────────────────────────────────────────

describe("Coverage gate", () => {
  test("warns when pet-fixture tests are skipped", () => {
    if (!TEST_PET_ID || !TEST_OWNER_USER_ID) {
      process.stdout.write(
        "\nWARNING: TEST_PET_ID / TEST_OWNER_USER_ID not set in env.json.\n" +
        "Ownership, sanitize, Zod-validation, eyeLog-scoping, and 405 tests are disabled.\n" +
        "Configure a test pet in env.json PetBasicInfoFunction for full coverage.\n\n"
      );
    }
    // Always passes — exists to surface the coverage gap in CI logs.
    expect(true).toBe(true);
  });
});

// ─── Unsupported routes → 405 ────────────────────────────────────────────────

describe("Unsupported methods → 405", () => {
  // POST is not in the routes map; guard passes for real pet before 405 is returned.
  petTest("POST /pets/{petID}/basic-info → 405", async () => {
    const res = await req("POST", `/pets/${TEST_PET_ID}/basic-info`, { name: "Test" }, ownerAuth());
    expect(res.status).toBe(405);
    expect(res.body.errorKey).toBe("petBasicInfo.errors.methodNotAllowed");
  });
});
