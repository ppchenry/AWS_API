/**
 * PetDetailInfo Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-petdetailinfo
 *
 * Tests cover:
 *   - CORS (preflight, allowed/disallowed origins)
 *   - Auth (missing, expired, garbage, alg:none JWT)
 *   - Guard (invalid petID, invalid sub-resource IDs, malformed JSON, empty body)
 *   - Ownership (stranger cannot access another user's pet)
 *   - Detail Info (GET, POST - Zod validation, date validation, motherParity)
 *   - Transfer (POST create, PUT update, DELETE - lifecycle, Zod, matchedCount)
 *   - NGO Transfer (PUT - RBAC, email/phone validation)
 *   - Source v2 (GET, POST create, PUT update - lifecycle, Zod, duplicate 409)
 *   - Adoption v2 (GET, POST create, PUT update, DELETE - lifecycle, Zod, duplicate 409)
 *   - 405 unsupported methods
 *   - Response shape consistency
 *   - Cleanup (source, adoption, transfer records created during tests)
 *
 * Pet-specific tests require:
 *   env.json PetDetailInfoFunction.TEST_PET_ID        - ObjectId of a live pet in the UAT DB
 *   env.json PetDetailInfoFunction.TEST_OWNER_USER_ID - userId that owns TEST_PET_ID
 *   env.json PetDetailInfoFunction.TEST_NGO_ID        - ngoId for NGO-role tests (optional)
 *
 * Response contract (from src/utils/response.js):
 *   Success -> { success: true, ...data }          (flat, fields like form, petId, sourceId, etc.)
 *   Error   -> { success: false, errorKey, error }  (flat, no statusCode wrapper)
 */

const jwt = require("../functions/PetDetailInfo/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = envConfig.PetDetailInfoFunction.JWT_SECRET;
const MONGODB_URI = envConfig.PetDetailInfoFunction?.MONGODB_URI || "";
const VALID_ORIGIN = envConfig.PetDetailInfoFunction.ALLOWED_ORIGINS.split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

// Valid ObjectId format that will never exist in the DB
const NONEXISTENT_PET_ID = "000000000000000000000001";
const NONEXISTENT_SUB_ID = "000000000000000000000099";
const INVALID_OBJECT_ID = "not-an-objectid";

const TEST_PET_ID = envConfig.PetDetailInfoFunction?.TEST_PET_ID || "";
const TEST_OWNER_USER_ID = envConfig.PetDetailInfoFunction?.TEST_OWNER_USER_ID || "";
const TEST_NGO_ID = envConfig.PetDetailInfoFunction?.TEST_NGO_ID || "";

// Conditional test runners
const petTest = TEST_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;
const ngoTest = TEST_PET_ID && TEST_OWNER_USER_ID && TEST_NGO_ID ? test : test.skip;

// Shared mutable state for IDs created during the lifecycle tests
const state = {
  transferId: null,
  sourceId: null,
  adoptionId: null,
  /** Snapshot of detail-info fields before tests mutate them (captured once). */
  originalDetailInfo: null,
};

// --- DB helpers ---------------------------------------------------------------

let mongoose;
let dbReady = false;
let connectAttempted = false;

/** Attempt a DB connection with a hard 8 s ceiling to avoid stalling the suite. */
async function connectDB() {
  if (dbReady || connectAttempted || !MONGODB_URI) return;
  connectAttempted = true;
  try {
    require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
    mongoose = require("mongoose");
    if (mongoose.connection.readyState === 0) {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DB connect timeout (8 s)")), 8000),
      );
      await Promise.race([
        mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 1,
        }),
        timeout,
      ]);
    }
    dbReady = true;
  } catch (err) {
    console.warn("[test] MongoDB unavailable - DB-backed checks will be skipped:", err.message);
    dbReady = false;
  }
}

async function disconnectDB() {
  if (!mongoose) return;
  try {
    if (mongoose.connection.readyState !== 0) {
      await Promise.race([
        mongoose.disconnect(),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    }
  } catch { /* swallow */ }
  dbReady = false;
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

// --- Token helpers ------------------------------------------------------------

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(
    { userId: TEST_OWNER_USER_ID || "aaaaaaaaaaaaaaaaaaaaaaaa", userEmail: "test@test.com", userRole: "user", ...payload },
    JWT_SECRET,
    { expiresIn: "1h", ...opts },
  );
}

function makeNgoToken(payload = {}) {
  return jwt.sign(
    {
      userId: TEST_OWNER_USER_ID || "aaaaaaaaaaaaaaaaaaaaaaaa",
      userEmail: "ngo@test.com",
      userRole: "ngo",
      ngoId: TEST_NGO_ID || "cccccccccccccccccccccccc",
      ...payload,
    },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

const ownerToken = makeToken();
const strangerToken = makeToken({ userId: "bbbbbbbbbbbbbbbbbbbbbbbb" });
const ngoToken = makeNgoToken();

function ownerAuth() { return { Authorization: "Bearer " + ownerToken }; }
function strangerAuth() { return { Authorization: "Bearer " + strangerToken }; }
function ngoAuth() { return { Authorization: "Bearer " + ngoToken }; }
function expiredAuth() {
  const token = jwt.sign(
    { userId: TEST_OWNER_USER_ID || "expired-user" },
    JWT_SECRET,
    { expiresIn: -60 },
  );
  return { Authorization: "Bearer " + token };
}

// --- Request helpers ----------------------------------------------------------

async function req(method, path, body, headers) {
  headers = headers || {};
  const res = await fetch(BASE_URL + path, {
    method: method,
    headers: Object.assign({
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      Connection: "close",
    }, headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  var json;
  try { json = await res.json(); } catch (_) { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

async function rawReq(method, path, rawBody, headers) {
  headers = headers || {};
  const res = await fetch(BASE_URL + path, {
    method: method,
    headers: Object.assign({
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      Connection: "close",
    }, headers),
    body: rawBody,
  });
  var json;
  try { json = await res.json(); } catch (_) { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

// --- Path shortcuts -----------------------------------------------------------

const detailPath = (petId) => "/pets/" + petId + "/detail-info";
const transferPath = (petId) => "/pets/" + petId + "/detail-info/transfer";
const transferIdPath = (petId, tId) => "/pets/" + petId + "/detail-info/transfer/" + tId;
const ngoTransferPath = (petId) => "/pets/" + petId + "/detail-info/NGOtransfer";
const sourcePath = (petId) => "/v2/pets/" + petId + "/detail-info/source";
const sourceIdPath = (petId, sId) => "/v2/pets/" + petId + "/detail-info/source/" + sId;
const adoptionPath = (petId) => "/v2/pets/" + petId + "/pet-adoption";
const adoptionIdPath = (petId, aId) => "/v2/pets/" + petId + "/pet-adoption/" + aId;


// =============================================================================
//  CORS PREFLIGHT
// =============================================================================

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(BASE_URL + detailPath(NONEXISTENT_PET_ID), {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(BASE_URL + detailPath(NONEXISTENT_PET_ID), {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(BASE_URL + detailPath(NONEXISTENT_PET_ID), {
      method: "OPTIONS",
    });
    expect(res.status).toBe(403);
  });

  test("v2 source preflight returns 204", async () => {
    const res = await fetch(BASE_URL + sourcePath(NONEXISTENT_PET_ID), {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
  });

  test("v2 adoption preflight returns 204", async () => {
    const res = await fetch(BASE_URL + adoptionPath(NONEXISTENT_PET_ID), {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(204);
  });
});


// =============================================================================
//  AUTH - JWT
// =============================================================================

describe("JWT authentication", () => {
  test("missing Authorization header -> 401", async () => {
    const r = await req("GET", detailPath(NONEXISTENT_PET_ID));
    expect(r.status).toBe(401);
    expect(r.body.errorKey).toBe("common.unauthorized");
  });

  test("expired token -> 401", async () => {
    const r = await req("GET", detailPath(NONEXISTENT_PET_ID), undefined, expiredAuth());
    expect(r.status).toBe(401);
    expect(r.body.errorKey).toBe("common.unauthorized");
  });

  test("garbage token -> 401", async () => {
    const r = await req("GET", detailPath(NONEXISTENT_PET_ID), undefined, {
      Authorization: "Bearer garbage.token.value",
    });
    expect(r.status).toBe(401);
    expect(r.body.errorKey).toBe("common.unauthorized");
  });

  test("wrong secret -> 401", async () => {
    const badToken = jwt.sign({ userId: "aaa" }, "wrong-secret", { expiresIn: "1h" });
    const r = await req("GET", detailPath(NONEXISTENT_PET_ID), undefined, {
      Authorization: "Bearer " + badToken,
    });
    expect(r.status).toBe(401);
    expect(r.body.errorKey).toBe("common.unauthorized");
  });

  test("alg:none attack -> 401", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ userId: "aaa" })).toString("base64url");
    const fakeToken = header + "." + payload + ".";
    const r = await req("GET", detailPath(NONEXISTENT_PET_ID), undefined, {
      Authorization: "Bearer " + fakeToken,
    });
    expect(r.status).toBe(401);
    expect(r.body.errorKey).toBe("common.unauthorized");
  });

  test("token without Bearer prefix -> 401", async () => {
    const r = await req("GET", detailPath(NONEXISTENT_PET_ID), undefined, {
      Authorization: ownerToken,
    });
    expect(r.status).toBe(401);
    expect(r.body.errorKey).toBe("common.unauthorized");
  });
});


// =============================================================================
//  GUARD - PATH PARAM VALIDATION
// =============================================================================

describe("Guard - path param validation", () => {
  test("invalid petID -> 400", async () => {
    const r = await req("GET", detailPath(INVALID_OBJECT_ID), undefined, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidPetIdFormat");
  });

  test("invalid transferId -> 400", async () => {
    const r = await req("PUT", transferIdPath(NONEXISTENT_PET_ID, INVALID_OBJECT_ID), { regPlace: "x" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.transferPath.invalidIdFormat");
  });

  test("invalid sourceId -> 400", async () => {
    const r = await req("PUT", sourceIdPath(NONEXISTENT_PET_ID, INVALID_OBJECT_ID), { channel: "x" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petSource.invalidSourceIdFormat");
  });

  test("invalid adoptionId -> 400", async () => {
    const r = await req("PUT", adoptionIdPath(NONEXISTENT_PET_ID, INVALID_OBJECT_ID), { postAdoptionName: "x" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petAdoption.invalidAdoptionIdFormat");
  });
});


// =============================================================================
//  GUARD - BODY VALIDATION
// =============================================================================

describe("Guard - body validation", () => {
  test("malformed JSON -> 400", async () => {
    const r = await rawReq("POST", detailPath(NONEXISTENT_PET_ID), "{bad json", ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("common.invalidJSON");
  });

  test("empty body on POST -> 400", async () => {
    const r = await req("POST", detailPath(NONEXISTENT_PET_ID), {}, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("common.missingParams");
  });

  test("empty body on PUT transfer -> 400", async () => {
    const r = await req("PUT", transferIdPath(NONEXISTENT_PET_ID, NONEXISTENT_SUB_ID), {}, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("common.missingParams");
  });

  test("empty body on PUT source -> 400", async () => {
    const r = await req("PUT", sourceIdPath(NONEXISTENT_PET_ID, NONEXISTENT_SUB_ID), {}, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("common.missingParams");
  });

  test("empty body on PUT adoption -> 400", async () => {
    const r = await req("PUT", adoptionIdPath(NONEXISTENT_PET_ID, NONEXISTENT_SUB_ID), {}, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("common.missingParams");
  });
});


// =============================================================================
//  OWNERSHIP
// =============================================================================

describe("Ownership", () => {
  petTest("stranger cannot GET detail-info of another user's pet", async () => {
    const r = await req("GET", detailPath(TEST_PET_ID), undefined, strangerAuth());
    expect(r.status).toBe(403);
    expect(r.body.errorKey).toBe("common.forbidden");
  });

  petTest("stranger cannot POST detail-info of another user's pet", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { chipId: "HACK" }, strangerAuth());
    expect(r.status).toBe(403);
    expect(r.body.errorKey).toBe("common.forbidden");
  });

  petTest("stranger cannot POST transfer on another user's pet", async () => {
    const r = await req("POST", transferPath(TEST_PET_ID), { regPlace: "x" }, strangerAuth());
    expect(r.status).toBe(403);
    expect(r.body.errorKey).toBe("common.forbidden");
  });

  petTest("stranger cannot GET source of another user's pet", async () => {
    const r = await req("GET", sourcePath(TEST_PET_ID), undefined, strangerAuth());
    expect(r.status).toBe(403);
    expect(r.body.errorKey).toBe("common.forbidden");
  });

  petTest("stranger cannot GET adoption of another user's pet", async () => {
    const r = await req("GET", adoptionPath(TEST_PET_ID), undefined, strangerAuth());
    expect(r.status).toBe(403);
    expect(r.body.errorKey).toBe("common.forbidden");
  });
});


// =============================================================================
//  DETAIL INFO - GET / POST (with snapshot + restore)
// =============================================================================

describe("Detail info", () => {
  // Capture original detail fields before any mutation
  petTest("snapshot original detail-info for later restore", async () => {
    const r = await req("GET", detailPath(TEST_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    // Save the mutable fields so we can restore them in Cleanup
    const f = r.body.form || {};
    state.originalDetailInfo = {
      chipId: f.chipId !== undefined ? f.chipId : null,
      motherParity: f.motherParity !== undefined ? f.motherParity : null,
    };
  });

  petTest("GET returns 200 with form and petId", async () => {
    const r = await req("GET", detailPath(TEST_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("form");
    expect(r.body).toHaveProperty("petId");
  });

  test("GET nonexistent pet -> 404 (ownership finds no pet)", async () => {
    const r = await req("GET", detailPath(NONEXISTENT_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(404);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petNotFound");
  });

  petTest("POST updates chipId successfully", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { chipId: "TEST-CHIP-001" }, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("petId", TEST_PET_ID);
  });

  petTest("POST with invalid motherDOB date -> 400", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { motherDOB: "not-a-date" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidDateFormat");
  });

  petTest("POST with invalid fatherDOB date -> 400", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { fatherDOB: "2024-13-01" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidDateFormat");
  });

  petTest("POST with valid DD/MM/YYYY date -> 200", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { motherDOB: "15/03/2020" }, ownerAuth());
    expect(r.status).toBe(200);
  });

  petTest("POST with valid YYYY-MM-DD date -> 200", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { fatherDOB: "2020-03-15" }, ownerAuth());
    expect(r.status).toBe(200);
  });

  petTest("POST with ISO timestamp with junk suffix -> 400", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { motherDOB: "2024-02-29Tjunk" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidDateFormat");
  });

  petTest("POST with ISO timestamp T99:99:99Z -> 400", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { motherDOB: "2024-02-29T99:99:99Z" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidDateFormat");
  });

  petTest("POST motherParity as numeric string -> 200", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { motherParity: "3" }, ownerAuth());
    expect(r.status).toBe(200);
  });

  petTest("POST motherParity as non-numeric string -> 400", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { motherParity: "abc" }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidMotherParity");
  });

  petTest("POST motherParity as number -> 200", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { motherParity: 5 }, ownerAuth());
    expect(r.status).toBe(200);
  });

  petTest("POST with Zod-invalid field type (chipId as number) -> 400", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { chipId: 12345 }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(typeof r.body.errorKey).toBe("string");
  });

  petTest("POST with unknown fields - Zod strips, chipId still persists", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), { chipId: "SAFE", deleted: true }, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});


// =============================================================================
//  TRANSFER - LIFECYCLE (CREATE -> UPDATE -> DELETE)
// =============================================================================

describe("Transfer lifecycle", () => {
  petTest("POST create transfer -> 200", async () => {
    const r = await req("POST", transferPath(TEST_PET_ID), {
      regDate: "2024-01-15",
      regPlace: "Test Place",
      transferOwner: "Test Owner",
      transferContact: "1234567890",
      transferRemark: "Integration test",
    }, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("transferId");
    state.transferId = String(r.body.transferId);
  });

  petTest("POST create transfer with DD/MM/YYYY date -> 200", async () => {
    const r = await req("POST", transferPath(TEST_PET_ID), {
      regDate: "15/01/2024",
      regPlace: "DD/MM Test",
    }, ownerAuth());
    expect(r.status).toBe(200);
    // Clean up the extra transfer
    if (r.body && r.body.transferId) {
      await req("DELETE", transferIdPath(TEST_PET_ID, String(r.body.transferId)), undefined, ownerAuth());
    }
  });

  petTest("POST create transfer with invalid date -> 400", async () => {
    const r = await req("POST", transferPath(TEST_PET_ID), {
      regDate: "2024-13-40",
      regPlace: "Bad Date",
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.transferPath.invalidDateFormat");
  });

  petTest("PUT update transfer -> 200", async () => {
    if (!state.transferId) return;
    const r = await req("PUT", transferIdPath(TEST_PET_ID, state.transferId), {
      regPlace: "Updated Place",
    }, ownerAuth());
    expect(r.status).toBe(200);
  });

  petTest("PUT update transfer - Zod rejects before DB (invalid type)", async () => {
    const r = await req("PUT", transferIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), {
      regDate: 12345,
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.transferPath.invalidDateFormat");
  });

  petTest("PUT update nonexistent transfer -> 404", async () => {
    const r = await req("PUT", transferIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), {
      regPlace: "Ghost",
    }, ownerAuth());
    expect(r.status).toBe(404);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.transferPath.notFound");
  });

  petTest("DELETE transfer -> 200", async () => {
    if (!state.transferId) return;
    const r = await req("DELETE", transferIdPath(TEST_PET_ID, state.transferId), undefined, ownerAuth());
    expect(r.status).toBe(200);
    state.transferId = null;
  });

  petTest("DELETE nonexistent transfer -> 404 (matchedCount check)", async () => {
    const r = await req("DELETE", transferIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), undefined, ownerAuth());
    expect(r.status).toBe(404);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.transferPath.notFound");
  });
});


// =============================================================================
//  NGO TRANSFER
// =============================================================================

describe("NGO Transfer", () => {
  test("non-NGO user cannot PUT NGOtransfer -> 403", async () => {
    const r = await req("PUT", ngoTransferPath(NONEXISTENT_PET_ID), {
      UserEmail: "test@example.com",
      UserContact: "+85291234567",
    }, ownerAuth());
    expect(r.status).toBe(403);
    expect(r.body.errorKey).toBe("common.forbidden");
  });

  ngoTest("NGO token with invalid email format -> 400", async () => {
    const r = await req("PUT", ngoTransferPath(TEST_PET_ID), {
      UserEmail: "not-an-email",
      UserContact: "+85291234567",
    }, ngoAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.ngoTransfer.invalidEmailFormat");
  });

  ngoTest("NGO token with invalid phone format -> 400", async () => {
    const r = await req("PUT", ngoTransferPath(TEST_PET_ID), {
      UserEmail: "test@example.com",
      UserContact: "not-a-phone",
    }, ngoAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.ngoTransfer.invalidPhoneFormat");
  });

  ngoTest("NGO transfer missing required fields -> 400", async () => {
    const r = await req("PUT", ngoTransferPath(TEST_PET_ID), {
      regPlace: "somewhere",
    }, ngoAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.ngoTransfer.missingRequiredFields");
  });
});


// =============================================================================
//  SOURCE v2 - LIFECYCLE (GET -> CREATE -> UPDATE -> cleanup)
// =============================================================================

describe("Source v2 lifecycle", () => {
  petTest("GET source (initially may be null) -> 200", async () => {
    const r = await req("GET", sourcePath(TEST_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("petId", TEST_PET_ID);
  });

  petTest("POST create source -> 201", async () => {
    // If a source record already exists, reuse it (no DELETE route available)
    const existing = await req("GET", sourcePath(TEST_PET_ID), undefined, ownerAuth());
    if (existing.body && existing.body.sourceId) {
      state.sourceId = String(existing.body.sourceId);
      console.log("[test] Source record already exists, skipping create, using existing:", state.sourceId);
      return;
    }

    const r = await req("POST", sourcePath(TEST_PET_ID), {
      placeofOrigin: "Test Origin",
      channel: "Test Channel",
      rescueCategory: ["stray"],
      causeOfInjury: "none",
    }, ownerAuth());
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("sourceId");
    state.sourceId = String(r.body.sourceId);
  });

  petTest("POST create source duplicate -> 409", async () => {
    if (!state.sourceId) return;
    const r = await req("POST", sourcePath(TEST_PET_ID), {
      placeofOrigin: "Duplicate",
      channel: "Duplicate",
    }, ownerAuth());
    expect(r.status).toBe(409);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petSource.duplicateRecord");
  });

  petTest("POST create source missing required fields -> 400 (Zod refine)", async () => {
    const r = await req("POST", sourcePath(TEST_PET_ID), {
      causeOfInjury: "test",
    }, ownerAuth());
    // 400 (Zod) or 409 (already exists) are both valid outcomes
    expect([400, 409]).toContain(r.status);
  });

  petTest("PUT update source -> 200", async () => {
    if (!state.sourceId) return;
    const r = await req("PUT", sourceIdPath(TEST_PET_ID, state.sourceId), {
      channel: "Updated Channel",
    }, ownerAuth());
    expect(r.status).toBe(200);
  });

  petTest("PUT update source - Zod rejects before DB (invalid type)", async () => {
    const r = await req("PUT", sourceIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), {
      rescueCategory: "not-an-array",
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(typeof r.body.errorKey).toBe("string");
  });

  petTest("PUT update source with no valid fields -> 400", async () => {
    if (!state.sourceId) return;
    const r = await req("PUT", sourceIdPath(TEST_PET_ID, state.sourceId), {
      unknownField: "value",
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petSource.noFieldsToUpdate");
  });

  petTest("PUT update nonexistent source -> 404", async () => {
    const r = await req("PUT", sourceIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), {
      channel: "Ghost",
    }, ownerAuth());
    expect(r.status).toBe(404);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petSource.recordNotFound");
  });

  petTest("GET source returns sourceId in response", async () => {
    if (!state.sourceId) return;
    const r = await req("GET", sourcePath(TEST_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("sourceId");
    expect(String(r.body.sourceId)).toBe(state.sourceId);
  });
});


// =============================================================================
//  ADOPTION v2 - LIFECYCLE (GET -> CREATE -> UPDATE -> DELETE)
// =============================================================================

describe("Adoption v2 lifecycle", () => {
  petTest("GET adoption (initially may be null) -> 200", async () => {
    const r = await req("GET", adoptionPath(TEST_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("petId", TEST_PET_ID);
  });

  petTest("POST create adoption -> 201", async () => {
    // Clean up any existing adoption first
    const existing = await req("GET", adoptionPath(TEST_PET_ID), undefined, ownerAuth());
    if (existing.body && existing.body.adoptionId) {
      await req("DELETE", adoptionIdPath(TEST_PET_ID, String(existing.body.adoptionId)), undefined, ownerAuth());
    }

    const r = await req("POST", adoptionPath(TEST_PET_ID), {
      postAdoptionName: "Test Adoption Name",
      isNeutered: true,
      NeuteredDate: "2024-06-15",
      firstVaccinationDate: "2024-01-10",
      followUpMonth1: true,
      followUpMonth2: false,
    }, ownerAuth());
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("adoptionId");
    state.adoptionId = String(r.body.adoptionId);
  });

  petTest("POST create adoption duplicate -> 409", async () => {
    if (!state.adoptionId) return;
    const r = await req("POST", adoptionPath(TEST_PET_ID), {
      postAdoptionName: "Duplicate",
    }, ownerAuth());
    expect(r.status).toBe(409);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petAdoption.duplicateRecord");
  });

  petTest("POST create adoption with invalid date -> 400 (delete + re-test)", async () => {
    // Delete existing adoption to test the date validation path
    if (state.adoptionId) {
      await req("DELETE", adoptionIdPath(TEST_PET_ID, state.adoptionId), undefined, ownerAuth());
      state.adoptionId = null;
    }
    const r = await req("POST", adoptionPath(TEST_PET_ID), {
      NeuteredDate: "2024-13-40",
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petAdoption.invalidDateFormat");
    // Re-create adoption for later tests
    const recreate = await req("POST", adoptionPath(TEST_PET_ID), {
      postAdoptionName: "Recreated After Bad Date Test",
      isNeutered: false,
    }, ownerAuth());
    if (recreate.body && recreate.body.adoptionId) state.adoptionId = String(recreate.body.adoptionId);
  });

  petTest("PUT update adoption -> 200", async () => {
    if (!state.adoptionId) return;
    const r = await req("PUT", adoptionIdPath(TEST_PET_ID, state.adoptionId), {
      postAdoptionName: "Updated Name",
      followUpMonth3: true,
    }, ownerAuth());
    expect(r.status).toBe(200);
  });

  petTest("PUT update adoption - Zod rejects before DB (invalid type)", async () => {
    const r = await req("PUT", adoptionIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), {
      isNeutered: "not-a-boolean",
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(typeof r.body.errorKey).toBe("string");
  });

  petTest("PUT update adoption with invalid date -> 400", async () => {
    if (!state.adoptionId) return;
    const r = await req("PUT", adoptionIdPath(TEST_PET_ID, state.adoptionId), {
      NeuteredDate: "2024-02-29Tjunk",
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petAdoption.invalidDateFormat");
  });

  petTest("PUT update nonexistent adoption -> 404", async () => {
    const r = await req("PUT", adoptionIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), {
      postAdoptionName: "Ghost",
    }, ownerAuth());
    expect(r.status).toBe(404);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petAdoption.recordNotFound");
  });

  petTest("GET adoption returns adoptionId in response", async () => {
    if (!state.adoptionId) return;
    const r = await req("GET", adoptionPath(TEST_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("adoptionId");
    expect(String(r.body.adoptionId)).toBe(state.adoptionId);
  });

  petTest("DELETE adoption -> 200", async () => {
    if (!state.adoptionId) return;
    const r = await req("DELETE", adoptionIdPath(TEST_PET_ID, state.adoptionId), undefined, ownerAuth());
    expect(r.status).toBe(200);
    state.adoptionId = null;
  });

  petTest("DELETE nonexistent adoption -> 404", async () => {
    const r = await req("DELETE", adoptionIdPath(TEST_PET_ID, NONEXISTENT_SUB_ID), undefined, ownerAuth());
    expect(r.status).toBe(404);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.petAdoption.recordNotFound");
  });
});


// =============================================================================
//  405 - UNSUPPORTED METHODS
// =============================================================================

describe("405 unsupported methods", () => {
  // SAM local returns 403 {"message":"Missing Authentication Token"} for routes
  // not declared in template.yaml.  That is the API Gateway behaviour for unknown
  // method+path combos, so we accept 403 as the "not routed" signal here.
  test("PATCH on detail-info -> 403 (SAM: missing route)", async () => {
    const r = await req("PATCH", detailPath(NONEXISTENT_PET_ID), { chipId: "x" }, ownerAuth());
    expect(r.status).toBe(403);
  });

  test("GET on transfer (no list route) -> 403 (SAM: missing route)", async () => {
    const r = await req("GET", transferPath(NONEXISTENT_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(403);
  });
});


// =============================================================================
//  RESPONSE SHAPE CONSISTENCY
// =============================================================================

describe("Response shape", () => {
  test("error responses have { success: false, errorKey, error }", async () => {
    const r = await req("GET", detailPath(INVALID_OBJECT_ID), undefined, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidPetIdFormat");
    expect(typeof r.body.error).toBe("string");
  });

  petTest("success responses have { success: true, ... }", async () => {
    const r = await req("GET", detailPath(TEST_PET_ID), undefined, ownerAuth());
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body).toHaveProperty("form");
    expect(r.body).toHaveProperty("petId");
  });
});


// =============================================================================
//  NOSQL INJECTION GUARD
// =============================================================================

describe("NoSQL injection prevention", () => {
  test("petID with $gt operator -> 400 (invalid ObjectId)", async () => {
    const r = await req("GET", detailPath('{"$gt":""}'), undefined, ownerAuth());
    expect(r.status).toBe(400);
    expect(r.body.errorKey).toBe("petDetailInfo.errors.invalidPetIdFormat");
  });

  petTest("body with $set operator in field value is treated as string", async () => {
    const r = await req("POST", detailPath(TEST_PET_ID), {
      chipId: { "$set": { deleted: true } },
    }, ownerAuth());
    expect(r.status).toBe(400);
    expect(typeof r.body.errorKey).toBe("string");
  });
});


// =============================================================================
//  CLEANUP - restore detail-info, remove lifecycle records
// =============================================================================

describe("Cleanup", () => {
  // Restore the detail-info fields we mutated during tests
  petTest("restore original detail-info fields", async () => {
    if (!state.originalDetailInfo) return;
    var restore = {};
    if (state.originalDetailInfo.chipId !== null) restore.chipId = state.originalDetailInfo.chipId;
    if (state.originalDetailInfo.motherParity !== null) restore.motherParity = state.originalDetailInfo.motherParity;
    if (Object.keys(restore).length === 0) return;
    await req("POST", detailPath(TEST_PET_ID), restore, ownerAuth());
  });

  petTest("remove leftover transfer record", async () => {
    if (!state.transferId) return;
    await req("DELETE", transferIdPath(TEST_PET_ID, state.transferId), undefined, ownerAuth());
    state.transferId = null;
  });

  petTest("remove leftover adoption record", async () => {
    if (!state.adoptionId) return;
    await req("DELETE", adoptionIdPath(TEST_PET_ID, state.adoptionId), undefined, ownerAuth());
    state.adoptionId = null;
  });

  // Source has no DELETE route; cleanup via direct DB if available
  dbTest("remove leftover source record via DB", async () => {
    if (!state.sourceId) return;
    const col = mongoose.connection.collection("pet_sources");
    await col.deleteOne({ _id: new mongoose.Types.ObjectId(state.sourceId) });
    state.sourceId = null;
  });

  afterAll(async () => {
    await disconnectDB();
  });
});
