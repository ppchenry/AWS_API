/**
 * GetAllPets Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-getallpets
 *
 * Two test tiers:
 *   Tier 1 (always runs): CORS, JWT, guard validation, response shape
 *     checks — uses NONEXISTENT IDs that guarantee 404/400 without needing
 *     real DB records.
 *   Tier 2 (requires env.json fixture IDs): ownership, sanitization, search,
 *     sorting, pagination, NGO listing. Skipped if IDs are absent.
 *
 * Environment limitations:
 *   - 405 coverage: API Gateway intercepts wrong-method requests before the
 *     Lambda executes, returning its own 403. The router's 405 code path is
 *     unreachable through SAM/API GW and therefore untestable at integration
 *     level.
 *   - Delete lifecycle: Requires TEST_DISPOSABLE_PET_ID pointing to a pet
 *     safe to soft-delete. Not available against production data. These tests
 *     are gated behind the disposableTest runner and skip cleanly.
 *
 * Required env.json keys under GetAllPetsFunction:
 *   JWT_SECRET, JWT_BYPASS, ALLOWED_ORIGINS, MONGODB_URI
 *
 * Optional env.json keys (enable Tier 2):
 *   TEST_NGO_ID            — ngoId with at least one non-deleted pet
 *   TEST_OWNER_USER_ID     — userId that owns TEST_PET_ID
 *   TEST_PET_ID            — petId owned by TEST_OWNER_USER_ID (not deleted)
 *   TEST_DISPOSABLE_PET_ID — petId owned by TEST_OWNER_USER_ID, safe to soft-delete
 */

const jwt = require("../functions/GetAllPets/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

jest.setTimeout(15000);

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = envConfig.GetAllPetsFunction.JWT_SECRET;
const VALID_ORIGIN = envConfig.GetAllPetsFunction.ALLOWED_ORIGINS.split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

// Valid ObjectId format, guaranteed absent from DB
const NONEXISTENT_ID = "000000000000000000000001";

// Tier 2 fixture IDs — leave empty in env.json to skip
const TEST_NGO_ID = envConfig.GetAllPetsFunction?.TEST_NGO_ID || "";
const TEST_OWNER_USER_ID = envConfig.GetAllPetsFunction?.TEST_OWNER_USER_ID || "";
const TEST_PET_ID = envConfig.GetAllPetsFunction?.TEST_PET_ID || "";
const DISPOSABLE_PET_ID = envConfig.GetAllPetsFunction?.TEST_DISPOSABLE_PET_ID || "";

const ngoTest = TEST_NGO_ID ? test : test.skip;
const petTest = TEST_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;
const disposableTest = DISPOSABLE_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;

// ─── Token helpers ───────────────────────────────────────────────────────────

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...opts });
}

const ownerToken = TEST_OWNER_USER_ID ? makeToken({ userId: TEST_OWNER_USER_ID }) : "";
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

// ═══════════════════════════════════════════════════════════════════════════════
//  TIER 1 — Always runs (no DB fixtures required)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CORS Preflight ──────────────────────────────────────────────────────────

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(`${BASE_URL}/pets/pet-list-ngo/${NONEXISTENT_ID}`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  }, 30000);

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(`${BASE_URL}/pets/pet-list-ngo/${NONEXISTENT_ID}`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(`${BASE_URL}/pets/pet-list-ngo/${NONEXISTENT_ID}`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(403);
  });

  test("preflight works across all four route paths", async () => {
    const paths = [
      `/pets/pet-list-ngo/${NONEXISTENT_ID}`,
      "/pets/deletePet",
      "/pets/updatePetEye",
      `/pets/pet-list/${NONEXISTENT_ID}`,
    ];
    for (const path of paths) {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "OPTIONS",
        headers: { Origin: VALID_ORIGIN },
      });
      expect(res.status).toBe(204);
    }
  });
});

// ─── JWT Authentication ──────────────────────────────────────────────────────

describe("JWT authentication on protected routes", () => {
  test("rejects request with no Authorization header → 401", async () => {
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT → 401", async () => {
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`, undefined, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Bearer token → 401", async () => {
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`, undefined, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects token without Bearer prefix → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`, undefined, {
      Authorization: token,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects tampered JWT signature → 401", async () => {
    const token = makeToken({ userId: "any-user" });
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`, undefined, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects alg:none token → 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({ userId: "any-user" })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`, undefined, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("NGO pet list does NOT require JWT (public route)", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${NONEXISTENT_ID}`);
    // 404 (no pets) proves it passed auth — not 401
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("ngoPath.noPetsFound");
  });
});

// ─── Error Response Shape ────────────────────────────────────────────────────

describe("Error response contract", () => {
  test("error responses include success:false, errorKey, error string, and requestId", async () => {
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(typeof res.body.requestId).toBe("string");
  });
});

// ─── Guard: Malformed JSON / Empty Body ──────────────────────────────────────

describe("Guard: malformed body", () => {
  test("rejects invalid JSON on POST deletePet → 400 invalidJSON", async () => {
    const res = await rawReq(
      "POST",
      "/pets/deletePet",
      "{ this is not json }",
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rejects invalid JSON on PUT updatePetEye → 400 invalidJSON", async () => {
    const res = await rawReq(
      "PUT",
      "/pets/updatePetEye",
      '{"petId":"broken"',
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rejects empty body on POST deletePet → 400 missingParams", async () => {
    const res = await req("POST", "/pets/deletePet", {}, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects empty body on PUT updatePetEye → 400 missingParams", async () => {
    const res = await req("PUT", "/pets/updatePetEye", {}, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });
});

// ─── Guard: Path ObjectId Validation ─────────────────────────────────────────

describe("Guard: path parameter validation", () => {
  test("rejects invalid ngoId format → 400", async () => {
    const res = await req("GET", "/pets/pet-list-ngo/not-an-objectid");
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("ngoPath.invalidNgoIdFormat");
  });

  test("rejects invalid userId format → 400", async () => {
    const badUserId = "not-an-objectid";
    // JWT userId must match path userId so self-access passes, then ObjectId check fires
    const matchingToken = makeToken({ userId: badUserId });
    const res = await req("GET", `/pets/pet-list/${badUserId}`, undefined, {
      Authorization: `Bearer ${matchingToken}`,
    });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("getPetsByUser.invalidUserIdFormat");
  });
});

// ─── Self-Access: userPetList ────────────────────────────────────────────────

describe("Self-access enforcement on GET /pets/pet-list/{userId}", () => {
  test("returns 403 when JWT userId does not match path userId", async () => {
    // strangerToken has userId 000...002 but path has NONEXISTENT_ID (000...001)
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`, undefined, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("passes self-access when JWT userId matches path userId", async () => {
    // Token for 000...001 accessing /pets/pet-list/000...001
    const matchingToken = makeToken({ userId: NONEXISTENT_ID });
    const res = await req("GET", `/pets/pet-list/${NONEXISTENT_ID}`, undefined, {
      Authorization: `Bearer ${matchingToken}`,
    });
    // 200 with empty list (not 403/401) proves self-access passed
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── DELETE (Zod + format validation) ────────────────────────────────────────

describe("POST /pets/deletePet — validation", () => {
  test("rejects missing petId → 400", async () => {
    const res = await req("POST", "/pets/deletePet", { other: "field" }, strangerAuth());
    expect(res.status).toBe(400);
    // .strict() rejects unknown keys
  });

  test("rejects empty petId string → 400", async () => {
    const res = await req("POST", "/pets/deletePet", { petId: "" }, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("deleteStatus.missingPetId");
  });

  test("rejects invalid petId format → 400", async () => {
    const res = await req("POST", "/pets/deletePet", { petId: "not-an-objectid" }, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("deleteStatus.invalidPetIdFormat");
  });

  test("rejects extra fields via .strict() → 400", async () => {
    const res = await req("POST", "/pets/deletePet", {
      petId: NONEXISTENT_ID,
      deleted: false,
    }, strangerAuth());
    expect(res.status).toBe(400);
  });

  test("returns 404 for nonexistent petId with valid format", async () => {
    const res = await req("POST", "/pets/deletePet", { petId: NONEXISTENT_ID }, strangerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("deleteStatus.petNotFound");
  });
});

// ─── UPDATE PET EYE (Zod + format validation) ───────────────────────────────

describe("PUT /pets/updatePetEye — validation", () => {
  const validBody = {
    petId: NONEXISTENT_ID,
    date: "2025-01-15",
    leftEyeImage1PublicAccessUrl: "https://example.com/left.jpg",
    rightEyeImage1PublicAccessUrl: "https://example.com/right.jpg",
  };

  test("rejects missing required fields → 400", async () => {
    const res = await req("PUT", "/pets/updatePetEye", { petId: NONEXISTENT_ID }, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updatePetEye.missingRequiredFields");
  });

  test("rejects invalid petId format → 400", async () => {
    const res = await req("PUT", "/pets/updatePetEye", {
      ...validBody,
      petId: "not-an-objectid",
    }, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updatePetEye.invalidPetIdFormat");
  });

  test("rejects invalid date format → 400", async () => {
    const res = await req("PUT", "/pets/updatePetEye", {
      ...validBody,
      date: "not-a-date",
    }, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updatePetEye.invalidDateFormat");
  });

  test("rejects invalid image URL → 400", async () => {
    const res = await req("PUT", "/pets/updatePetEye", {
      ...validBody,
      leftEyeImage1PublicAccessUrl: "not-a-url",
    }, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("updatePetEye.invalidImageUrlFormat");
  });

  test("rejects extra fields via .strict() → 400", async () => {
    const res = await req("PUT", "/pets/updatePetEye", {
      ...validBody,
      deleted: false,
    }, strangerAuth());
    expect(res.status).toBe(400);
  });

  test("returns 404 for nonexistent petId with all valid fields", async () => {
    const res = await req("PUT", "/pets/updatePetEye", validBody, strangerAuth());
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("updatePetEye.petNotFound");
  });
});

// ─── NGO Pet List (public, Tier 1 core) ─────────────────────────────────────

describe("GET /pets/pet-list-ngo/{ngoId} — Tier 1", () => {
  test("returns 404 for valid ngoId with no pets", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${NONEXISTENT_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("ngoPath.noPetsFound");
  });

  test("includes CORS headers on the response", async () => {
    const res = await fetch(`${BASE_URL}/pets/pet-list-ngo/${NONEXISTENT_ID}`, {
      method: "GET",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TIER 2 — Requires fixture IDs in env.json
// ═══════════════════════════════════════════════════════════════════════════════

// ─── NGO Pet List (data tests) ───────────────────────────────────────────────

describe("GET /pets/pet-list-ngo/{ngoId} — Tier 2", () => {
  ngoTest("returns 200 with pets array and pagination", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.pets)).toBe(true);
    expect(res.body.pets.length).toBeGreaterThan(0);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.currentPage).toBe(1);
    expect(typeof res.body.perPage).toBe("number");
  });

  ngoTest("sanitized pets do not leak __v or deleted fields", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}`);
    expect(res.status).toBe(200);
    for (const pet of res.body.pets) {
      expect(pet.__v).toBeUndefined();
      expect(pet.deleted).toBeUndefined();
    }
  });

  ngoTest("search=nonexistent returns 404 with correct error key", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?search=ZZZZNOEXIST99`);
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("ngoPath.noPetsFound");
  });

  ngoTest("search=dog filters results to matching animals", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?search=dog`);
    expect(res.status).toBe(200);
    expect(res.body.pets.length).toBeGreaterThan(0);
    // Every returned pet must contain the search token in at least one searchable field
    const SEARCH_FIELDS = ["name", "animal", "breed", "ngoPetId", "owner"];
    for (const pet of res.body.pets) {
      const matchesAny = SEARCH_FIELDS.some(
        (f) => typeof pet[f] === "string" && pet[f].toLowerCase().includes("dog")
      );
      expect(matchesAny).toBe(true);
    }
    // Filtered total must be less than unfiltered total
    const unfilteredRes = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}`);
    expect(res.body.total).toBeLessThan(unfilteredRes.body.total);
  });

  ngoTest("sortBy=createdAt&sortOrder=asc returns monotonically ascending dates", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?sortBy=createdAt&sortOrder=asc`);
    expect(res.status).toBe(200);
    const dates = res.body.pets.map((p) => new Date(p.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
    }
  });

  ngoTest("sortBy=createdAt&sortOrder=desc returns monotonically descending dates", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?sortBy=createdAt&sortOrder=desc`);
    expect(res.status).toBe(200);
    const dates = res.body.pets.map((p) => new Date(p.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });

  ngoTest("unknown sortBy falls back to updatedAt order", async () => {
    const [fallbackRes, defaultRes] = await Promise.all([
      req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?sortBy=INJECTED`),
      req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}`),
    ]);
    expect(fallbackRes.status).toBe(200);
    // Default sort is updatedAt desc — fallback should produce the same order
    const fallbackIds = fallbackRes.body.pets.map((p) => p._id);
    const defaultIds = defaultRes.body.pets.map((p) => p._id);
    expect(fallbackIds).toEqual(defaultIds);
  });

  ngoTest("page=2 returns a different set of pets than page=1", async () => {
    const [page1, page2] = await Promise.all([
      req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?page=1`),
      req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?page=2`),
    ]);
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.currentPage).toBe(1);
    expect(page2.body.currentPage).toBe(2);
    // Same total across pages
    expect(page1.body.total).toBe(page2.body.total);
    // No overlap between page 1 and page 2 pet IDs
    const page1Ids = new Set(page1.body.pets.map((p) => p._id));
    const page2Ids = page2.body.pets.map((p) => p._id);
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  ngoTest("page beyond last returns 404", async () => {
    const res = await req("GET", `/pets/pet-list-ngo/${TEST_NGO_ID}?page=9999`);
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("ngoPath.noPetsFound");
  });
});

// ─── User Pet List (data tests) ──────────────────────────────────────────────

describe("GET /pets/pet-list/{userId} — Tier 2", () => {
  petTest("returns 200 with form array for owner", async () => {
    const res = await req("GET", `/pets/pet-list/${TEST_OWNER_USER_ID}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  petTest("sanitized pets do not leak __v or deleted fields", async () => {
    const res = await req("GET", `/pets/pet-list/${TEST_OWNER_USER_ID}`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    for (const pet of res.body.form) {
      expect(pet.__v).toBeUndefined();
      expect(pet.deleted).toBeUndefined();
    }
  });

  petTest("returns 403 for a stranger JWT on another user's pet list", async () => {
    const res = await req("GET", `/pets/pet-list/${TEST_OWNER_USER_ID}`, undefined, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  petTest("high page returns 200 with empty form array", async () => {
    const res = await req("GET", `/pets/pet-list/${TEST_OWNER_USER_ID}?page=9999`, undefined, ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form)).toBe(true);
    expect(res.body.form.length).toBe(0);
  });
});

// ─── Delete Ownership ────────────────────────────────────────────────────────

describe("POST /pets/deletePet — ownership", () => {
  petTest("returns 403 for a stranger JWT on another user's pet", async () => {
    const res = await req("POST", "/pets/deletePet", { petId: TEST_PET_ID }, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });
});

// ─── UpdatePetEye Ownership ──────────────────────────────────────────────────

describe("PUT /pets/updatePetEye — ownership", () => {
  petTest("returns 403 for a stranger JWT on another user's pet", async () => {
    const res = await req("PUT", "/pets/updatePetEye", {
      petId: TEST_PET_ID,
      date: "2025-01-15",
      leftEyeImage1PublicAccessUrl: "https://example.com/left.jpg",
      rightEyeImage1PublicAccessUrl: "https://example.com/right.jpg",
    }, strangerAuth());
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });
});

// ─── Delete Lifecycle (disposable pet) ───────────────────────────────────────
// Environment limitation: requires TEST_DISPOSABLE_PET_ID pointing to a pet
// safe to soft-delete. Not available against production data — these tests
// skip cleanly. This is an environment gap, not a code gap.

describe("POST /pets/deletePet — lifecycle", () => {
  disposableTest("owner can soft-delete own pet → 200, then re-delete → 409", async () => {
    // First delete
    const del = await req("POST", "/pets/deletePet", { petId: DISPOSABLE_PET_ID }, ownerAuth());
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    expect(del.body.petId).toBe(DISPOSABLE_PET_ID);

    // Second delete → already deleted
    const reDel = await req("POST", "/pets/deletePet", { petId: DISPOSABLE_PET_ID }, ownerAuth());
    expect(reDel.status).toBe(409);
    expect(reDel.body.errorKey).toBe("deleteStatus.petAlreadyDeleted");
  });
});

// ─── UpdatePetEye on deleted pet ─────────────────────────────────────────────

describe("PUT /pets/updatePetEye — deleted pet", () => {
  // Runs only if DISPOSABLE_PET_ID was deleted by the lifecycle test above.
  disposableTest("returns 410 when updating a deleted pet", async () => {
    const res = await req("PUT", "/pets/updatePetEye", {
      petId: DISPOSABLE_PET_ID,
      date: "2025-06-01",
      leftEyeImage1PublicAccessUrl: "https://example.com/left.jpg",
      rightEyeImage1PublicAccessUrl: "https://example.com/right.jpg",
    }, ownerAuth());
    expect(res.status).toBe(410);
    expect(res.body.errorKey).toBe("updatePetEye.petDeleted");
  });
});

// ─── Coverage Gate ───────────────────────────────────────────────────────────

describe("Coverage gate", () => {
  test("warns when fixture tests are skipped", () => {
    const missing = [];
    if (!TEST_NGO_ID) missing.push("TEST_NGO_ID");
    if (!TEST_OWNER_USER_ID) missing.push("TEST_OWNER_USER_ID");
    if (!TEST_PET_ID) missing.push("TEST_PET_ID");
    if (!DISPOSABLE_PET_ID) missing.push("TEST_DISPOSABLE_PET_ID");

    if (missing.length > 0) {
      process.stdout.write(
        `\nWARNING: Missing env.json GetAllPetsFunction keys: ${missing.join(", ")}\n` +
        "Tier 2 tests (ownership, sanitization, pagination, lifecycle) are skipped.\n" +
        "Configure these values for full coverage.\n\n"
      );
    }
    // Always passes — exists to surface coverage gap in CI logs.
    expect(true).toBe(true);
  });
});
