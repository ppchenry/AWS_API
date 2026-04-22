/**
 * PetVaccineRecords integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --runTestsByPath __tests__/test-petvaccinerecords.test.js
 *
 * Required env.json keys under PetVaccineRecordsFunction:
 *   JWT_SECRET, JWT_BYPASS, ALLOWED_ORIGINS, MONGODB_URI
 *
 * Optional fixture keys (fixture-backed tests skip if absent):
 *   TEST_PET_ID        - a live pet owned by TEST_OWNER_USER_ID
 *   TEST_OWNER_USER_ID - userId that owns TEST_PET_ID
 *   TEST_NGO_ID        - ngoId linked to TEST_PET_ID for NGO access checks
 */

const jwt = require("../functions/PetVaccineRecords/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

jest.setTimeout(30000);

const BASE_URL = "http://localhost:3000";
const config = envConfig.PetVaccineRecordsFunction || {};

const JWT_SECRET = config.JWT_SECRET;
const VALID_ORIGIN = (config.ALLOWED_ORIGINS || "http://localhost:3000").split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

const TEST_PET_ID = config.TEST_PET_ID || "";
const TEST_OWNER_USER_ID = config.TEST_OWNER_USER_ID || "";
const TEST_NGO_ID = config.TEST_NGO_ID || "";

const NONEXISTENT_PET_ID = "000000000000000000000001";
const NONEXISTENT_RECORD_ID = "000000000000000000000002";
const STRANGER_USER_ID = "000000000000000000000099";
const FIXTURE_TIMEOUT = 60000;

const ownerTest = TEST_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;
const ngoTest = TEST_PET_ID && TEST_NGO_ID ? test : test.skip;

const state = { vaccineRecordId: "" };

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...opts });
}

function ownerAuth() {
  return {
    Authorization: `Bearer ${makeToken({ userId: TEST_OWNER_USER_ID, userEmail: "owner@test.com", userRole: "user" })}`,
  };
}

function strangerAuth() {
  return {
    Authorization: `Bearer ${makeToken({ userId: STRANGER_USER_ID, userEmail: "stranger@test.com", userRole: "user" })}`,
  };
}

function ngoAuth() {
  return {
    Authorization: `Bearer ${makeToken({ userId: STRANGER_USER_ID, userEmail: "ngo@test.com", userRole: "ngo", ngoId: TEST_NGO_ID })}`,
  };
}

function expiredAuth() {
  return {
    Authorization: `Bearer ${jwt.sign(
      { userId: TEST_OWNER_USER_ID || STRANGER_USER_ID },
      JWT_SECRET,
      { expiresIn: -60 }
    )}`,
  };
}

function tamperedAuth() {
  const token = makeToken({ userId: TEST_OWNER_USER_ID || STRANGER_USER_ID });
  const [header, payload] = token.split(".");
  return { Authorization: `Bearer ${header}.${payload}.tampered` };
}

function noneAlgAuth() {
  const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const fakePayload = Buffer.from(JSON.stringify({ userId: STRANGER_USER_ID })).toString("base64url");
  return { Authorization: `Bearer ${fakeHeader}.${fakePayload}.` };
}

async function req(method, path, body, headers = {}) {
  const url = path.includes("?")
    ? `${BASE_URL}${path}&lang=en`
    : `${BASE_URL}${path}?lang=en`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body:
      body !== undefined
        ? typeof body === "string" ? body : JSON.stringify(body)
        : undefined,
    signal: AbortSignal.timeout(10000),
  });

  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json, headers: res.headers };
}

afterAll(async () => {
  if (state.vaccineRecordId && TEST_PET_ID) {
    await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/vaccine-record/${state.vaccineRecordId}`,
      undefined,
      ownerAuth()
    ).catch(() => {});
  }
});

// ─── OPTIONS preflight ────────────────────────────────────────────────────────

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for allowed origin", async () => {
    const res = await req("OPTIONS", `/pets/${NONEXISTENT_PET_ID}/vaccine-record`);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await req(
      "OPTIONS",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      { Origin: DISALLOWED_ORIGIN }
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.originNotAllowed");
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await req(
      "OPTIONS",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      { Origin: undefined }
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.originNotAllowed");
  });
});

// ─── JWT authentication ───────────────────────────────────────────────────────

describe("JWT authentication", () => {
  test("rejects request with no Authorization header → 401", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/vaccine-record`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT → 401", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      expiredAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Bearer token → 401", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      { Authorization: "Bearer this.is.garbage" }
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects token without Bearer prefix → 401", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      { Authorization: makeToken({ userId: STRANGER_USER_ID }) }
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects tampered JWT signature → 401", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      tamperedAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects alg:none JWT → 401", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      noneAlgAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("error shape includes success:false, errorKey, requestId, and CORS header", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/vaccine-record`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("others.unauthorized");
    expect(typeof res.body.error).toBe("string");
    expect(typeof res.body.requestId).toBe("string");
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

// ─── Guard validation ─────────────────────────────────────────────────────────

describe("Guard validation", () => {
  test("rejects malformed JSON body → 400", async () => {
    const res = await req(
      "POST",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      "{bad-json",
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rejects empty POST body → 400", async () => {
    const res = await req(
      "POST",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      {},
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects empty PUT body → 400", async () => {
    const res = await req(
      "PUT",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      {},
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects invalid petID format → 400", async () => {
    const res = await req("GET", "/pets/bad-id/vaccine-record", undefined, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("invalidPetIdFormat");
  });

  test("rejects invalid vaccineID format on PUT → 400", async () => {
    const res = await req(
      "PUT",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record/bad-id`,
      { vaccineName: "Rabies" },
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("vaccineRecord.invalidVaccineIdFormat");
  });

  ownerTest("rejects NoSQL injection object in vaccineName field on POST → 400", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      { vaccineName: { $gt: "" }, vaccineDate: "2024-01-15" },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  }, FIXTURE_TIMEOUT);
});

// ─── Router ───────────────────────────────────────────────────────────────────

describe("Router", () => {
  test("returns 404 petNotFound for nonexistent pet with valid auth", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petNotFound");
  });

  test("returns 403 for PATCH — method not declared in API Gateway (never reaches Lambda)", async () => {
    // PATCH is not defined in template.yaml so API Gateway rejects it with 403
    // before the Lambda is invoked. The Lambda router would return 405, but
    // PATCH must not be added to template.yaml to avoid exposing the route.
    const res = await req(
      "PATCH",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(403);
  });
});

// ─── Authorization ────────────────────────────────────────────────────────────

describe("Owner and NGO authorization", () => {
  ownerTest("owner can read vaccine records on fixture pet → 200", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form.vaccineRecords)).toBe(true);
  }, FIXTURE_TIMEOUT);

  ownerTest("stranger is denied access to fixture pet → 403", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.forbidden");
  }, FIXTURE_TIMEOUT);

  ngoTest("matching NGO can read vaccine records on fixture pet → 200", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      undefined,
      ngoAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form.vaccineRecords)).toBe(true);
  }, FIXTURE_TIMEOUT);

  ownerTest("stranger is denied POST on fixture pet → 403", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      { vaccineName: "Stranger Vaccine", vaccineDate: "2024-06-01" },
      strangerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.forbidden");
  }, FIXTURE_TIMEOUT);

  ownerTest("stranger is denied PUT on fixture pet → 403", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      { vaccineName: "Stranger Update" },
      strangerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.forbidden");
  }, FIXTURE_TIMEOUT);

  ownerTest("stranger is denied DELETE on fixture pet → 403", async () => {
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.forbidden");
  }, FIXTURE_TIMEOUT);
});

// ─── Vaccine record CRUD lifecycle ───────────────────────────────────────────

describe("Vaccine record CRUD lifecycle", () => {
  ownerTest("rejects impossible date on create → 400", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      { vaccineDate: "2024-02-31", vaccineName: "Rabies" },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("vaccineRecord.invalidDateFormat");
  }, FIXTURE_TIMEOUT);

  ownerTest("owner creates vaccine record → 200", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      {
        vaccineDate: "2024-01-15",
        vaccineName: `Rabies ${Date.now()}`,
        vaccineNumber: `VR-${Date.now()}`,
        vaccineTimes: "1",
        vaccinePosition: "left shoulder",
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.petId).toBe(TEST_PET_ID);
    expect(typeof res.body.vaccineId).toBe("string");
    expect(res.body.form._id).toBe(res.body.vaccineId);
    state.vaccineRecordId = res.body.vaccineId;
  }, FIXTURE_TIMEOUT);

  ownerTest("rejects update with empty body → 400", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      {},
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  }, FIXTURE_TIMEOUT);

  ownerTest("rejects update with unknown field only → 400", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      { hacked: true },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("vaccineRecord.noFieldsToUpdate");
  }, FIXTURE_TIMEOUT);

  ownerTest("update returns 404 for nonexistent record with valid payload → 404", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      { vaccineName: "Nope" },
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("vaccineRecord.vaccineRecordNotFound");
  }, FIXTURE_TIMEOUT);

  ownerTest("owner updates vaccine record → 200 with updated fields", async () => {
    expect(state.vaccineRecordId).toBeTruthy();
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${state.vaccineRecordId}`,
      { vaccinePosition: "right shoulder", vaccineTimes: "2" },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.form.vaccinePosition).toBe("right shoulder");
    expect(res.body.form.vaccineTimes).toBe("2");
  }, FIXTURE_TIMEOUT);

  ownerTest("delete returns 404 for nonexistent record → 404", async () => {
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("vaccineRecord.vaccineRecordNotFound");
  }, FIXTURE_TIMEOUT);

  ownerTest("cross-pet mutation: record addressed via wrong petId is rejected → 404", async () => {
    // Uses a real record ID (state.vaccineRecordId from the create test) but routes it
    // through a different petId (NONEXISTENT_PET_ID). The query filter { _id, petId }
    // must find nothing, proving the petId scope cannot be bypassed.
    expect(state.vaccineRecordId).toBeTruthy();
    const res = await req(
      "PUT",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record/${state.vaccineRecordId}`,
      { vaccineName: "Cross-pet attack" },
      ownerAuth()
    );
    // Either 404 (pet not found) or 403 (ownership check on NONEXISTENT_PET_ID) is correct;
    // either proves the record was not mutated via the wrong pet path.
    expect([403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  }, FIXTURE_TIMEOUT);

  ownerTest("owner soft-deletes record → 200 and record absent from subsequent list", async () => {
    expect(state.vaccineRecordId).toBeTruthy();
    const deletedId = state.vaccineRecordId;

    const deleteRes = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/vaccine-record/${deletedId}`,
      undefined,
      ownerAuth()
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.id).toBe(TEST_PET_ID);

    const listRes = await req(
      "GET",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      undefined,
      ownerAuth()
    );
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.form.vaccineRecords)).toBe(true);
    expect(listRes.body.form.vaccineRecords.some((r) => r._id === deletedId)).toBe(false);

    state.vaccineRecordId = "";
  }, FIXTURE_TIMEOUT);
});

// ─── Fixture configuration check ─────────────────────────────────────────────

describe("Fixture configuration", () => {
  test("warns when fixture env keys are missing", () => {
    if (!TEST_PET_ID || !TEST_OWNER_USER_ID) {
      console.warn(
        "\nWARNING: TEST_PET_ID / TEST_OWNER_USER_ID not configured in env.json PetVaccineRecordsFunction.\n" +
        "Fixture-backed CRUD and authorization tests will be skipped.\n"
      );
    }
    expect(true).toBe(true);
  });
});
