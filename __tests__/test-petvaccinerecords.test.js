/**
 * PetVaccineRecords integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --runTestsByPath __tests__/test-petvaccinerecords.test.js
 *
 * Required env.json keys under PetVaccineRecordsFunction:
 *   JWT_SECRET, JWT_BYPASS, ALLOWED_ORIGINS, MONGODB_URI
 *
 * Optional fixture keys under PetVaccineRecordsFunction or fallback
 * under PetMedicalRecordFunction:
 *   TEST_PET_ID         - live pet owned by TEST_OWNER_USER_ID
 *   TEST_OWNER_USER_ID  - owner userId for TEST_PET_ID
 *   TEST_NGO_ID         - ngoId attached to TEST_PET_ID for NGO access checks
 */

const jwt = require("../functions/PetVaccineRecords/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

jest.setTimeout(30000);

const BASE_URL = "http://localhost:3000";
const config = envConfig.PetVaccineRecordsFunction || {};
const fixtureFallback = envConfig.PetMedicalRecordFunction || {};

const JWT_SECRET = config.JWT_SECRET;
const VALID_ORIGIN = (config.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")[0]
  .trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

const TEST_PET_ID = config.TEST_PET_ID || fixtureFallback.TEST_PET_ID || "";
const TEST_OWNER_USER_ID =
  config.TEST_OWNER_USER_ID || fixtureFallback.TEST_OWNER_USER_ID || "";
const TEST_NGO_ID = config.TEST_NGO_ID || fixtureFallback.TEST_NGO_ID || "";

const NONEXISTENT_PET_ID = "000000000000000000000001";
const NONEXISTENT_RECORD_ID = "000000000000000000000002";
const STRANGER_USER_ID = "000000000000000000000099";
const FIXTURE_TEST_TIMEOUT_MS = 60000;

const ownerTest = TEST_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;
const ngoTest = TEST_PET_ID && TEST_NGO_ID ? test : test.skip;

const state = {
  vaccineRecordId: "",
};

function localizedPath(path) {
  return path.includes("?") ? `${path}&lang=en` : `${path}?lang=en`;
}

function makeToken(payload = {}, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...opts });
}

function ownerAuth() {
  if (!TEST_OWNER_USER_ID) return {};
  return {
    Authorization: `Bearer ${makeToken({
      userId: TEST_OWNER_USER_ID,
      userEmail: "owner@test.com",
      userRole: "user",
    })}`,
  };
}

function strangerAuth() {
  return {
    Authorization: `Bearer ${makeToken({
      userId: STRANGER_USER_ID,
      userEmail: "stranger@test.com",
      userRole: "user",
    })}`,
  };
}

function ngoAuth() {
  if (!TEST_NGO_ID) return {};
  return {
    Authorization: `Bearer ${makeToken({
      userId: STRANGER_USER_ID,
      userEmail: "ngo@test.com",
      userRole: "ngo",
      ngoId: TEST_NGO_ID,
    })}`,
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
  return {
    Authorization: `Bearer ${header}.${payload}.tampered`,
  };
}

function noneAlgAuth() {
  const fakeHeader = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" })
  ).toString("base64url");
  const fakePayload = Buffer.from(
    JSON.stringify({ userId: TEST_OWNER_USER_ID || STRANGER_USER_ID })
  ).toString("base64url");

  return {
    Authorization: `Bearer ${fakeHeader}.${fakePayload}.`,
  };
}

async function req(method, path, body, headers = {}, extra = {}) {
  const res = await fetch(`${BASE_URL}${localizedPath(path)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body:
      body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
    ...extra,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, body: json, headers: res.headers };
}

async function cleanupCreatedRecords() {
  if (!TEST_PET_ID || !TEST_OWNER_USER_ID || !state.vaccineRecordId) return;

  await req(
    "DELETE",
    `/pets/${TEST_PET_ID}/vaccine-record/${state.vaccineRecordId}`,
    undefined,
    ownerAuth()
  ).catch(() => {});
}

afterAll(async () => {
  await cleanupCreatedRecords();
});

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(
      `${BASE_URL}/pets/${NONEXISTENT_PET_ID}/vaccine-record?lang=en`,
      {
        method: "OPTIONS",
        headers: { Origin: VALID_ORIGIN },
      }
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(
      `${BASE_URL}/pets/${NONEXISTENT_PET_ID}/vaccine-record?lang=en`,
      {
        method: "OPTIONS",
        headers: { Origin: DISALLOWED_ORIGIN },
      }
    );

    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(
      `${BASE_URL}/pets/${NONEXISTENT_PET_ID}/vaccine-record?lang=en`,
      {
        method: "OPTIONS",
      }
    );

    expect(res.status).toBe(403);
  });
});

describe("JWT authentication", () => {
  test("rejects request with no Authorization header", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/vaccine-record`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects expired JWT", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      expiredAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects garbage Bearer token", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      { Authorization: "Bearer this.is.garbage" }
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects token without Bearer prefix", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      { Authorization: makeToken({ userId: STRANGER_USER_ID }) }
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects tampered JWT signature", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      tamperedAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("rejects alg:none JWT", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      noneAlgAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("others.unauthorized");
  });

  test("error shape includes success false and requestId", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/vaccine-record`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(typeof res.body.requestId).toBe("string");
  });

  test("error responses include CORS headers for allowed origin", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/vaccine-record`);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

describe("Guard validation", () => {
  test("rejects malformed JSON body", async () => {
    const res = await req(
      "POST",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      "{bad-json",
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.invalidJSON");
  });

  test("rejects empty POST body", async () => {
    const res = await req(
      "POST",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      {},
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects empty PUT body", async () => {
    const res = await req(
      "PUT",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      {},
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  });

  test("rejects invalid petID format", async () => {
    const res = await req(
      "GET",
      "/pets/bad-id/vaccine-record",
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("invalidPetIdFormat");
  });

  test("rejects invalid vaccineID format", async () => {
    const res = await req(
      "PUT",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record/bad-id`,
      { vaccineName: "Rabies" },
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("vaccineRecord.invalidVaccineIdFormat");
  });
});

describe("Router and nonexistent resource behavior", () => {
  test("returns 404 petNotFound for exact route key with nonexistent pet", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petNotFound");
  });

  test("returns 403/405 at API layer for unsupported method", async () => {
    const res = await req(
      "PATCH",
      `/pets/${NONEXISTENT_PET_ID}/vaccine-record`,
      undefined,
      strangerAuth()
    );
    expect([403, 405]).toContain(res.status);
  });
});

describe("Fixture-backed owner and NGO access", () => {
  ownerTest("owner can read vaccine records on fixture pet", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Pet vaccine record retrieved successfully");
    expect(Array.isArray(res.body.form.vaccineRecords)).toBe(true);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("stranger gets exact 403 forbidden on fixture pet", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("others.forbidden");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ngoTest("matching NGO can read records on fixture pet", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      undefined,
      ngoAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form.vaccineRecords)).toBe(true);
  }, FIXTURE_TEST_TIMEOUT_MS);
});

describe("Fixture-backed CRUD validation and lifecycle", () => {
  ownerTest("create rejects impossible ISO date", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/vaccine-record`,
      {
        vaccineDate: "2024-02-31",
        vaccineName: "Rabies",
      },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("vaccineRecord.invalidDateFormat");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner creates vaccine record successfully", async () => {
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
    expect(res.body.message).toBe("Pet vaccine record created successfully");
    expect(res.body.petId).toBe(TEST_PET_ID);
    expect(typeof res.body.vaccineId).toBe("string");
    expect(res.body.form._id).toBe(res.body.vaccineId);
    state.vaccineRecordId = res.body.vaccineId;
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("update rejects empty body with missingParams", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      {},
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("others.missingParams");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("update rejects unknown fields", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      { hacked: true },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("vaccineRecord.noFieldsToUpdate");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("update returns 404 on nonexistent record with valid payload", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      { vaccineName: "Nope" },
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("vaccineRecord.vaccineRecordNotFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner updates vaccine record successfully", async () => {
    expect(state.vaccineRecordId).toBeTruthy();

    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/vaccine-record/${state.vaccineRecordId}`,
      {
        vaccinePosition: "right shoulder",
        vaccineTimes: "2",
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Pet vaccine record updated successfully");
    expect(res.body.form.vaccinePosition).toBe("right shoulder");
    expect(res.body.form.vaccineTimes).toBe("2");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("delete returns 404 on record mismatch", async () => {
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/vaccine-record/${NONEXISTENT_RECORD_ID}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("vaccineRecord.vaccineRecordNotFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner deletes vaccine record successfully", async () => {
    expect(state.vaccineRecordId).toBeTruthy();

    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/vaccine-record/${state.vaccineRecordId}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Pet vaccine record deleted successfully");
    expect(res.body.id).toBe(TEST_PET_ID);
    state.vaccineRecordId = "";
  }, FIXTURE_TEST_TIMEOUT_MS);
});

describe("Fixture configuration visibility", () => {
  test("prints a warning when fixture env keys are missing", () => {
    if (!TEST_PET_ID || !TEST_OWNER_USER_ID) {
      console.warn(
        "\nWARNING: TEST_PET_ID / TEST_OWNER_USER_ID not set in env.json PetVaccineRecordsFunction or PetMedicalRecordFunction.\n" +
        "Fixture-backed vaccine CRUD and authorization tests will be skipped.\n"
      );
    }

    expect(true).toBe(true);
  });
});