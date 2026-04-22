/**
 * PetMedicalRecord integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-petmedicalrecord
 *
 * This suite exercises the real PetMedicalRecord handler and UAT MongoDB data.
 * It intentionally avoids module-level mocking for auth, guard, router,
 * self-access, and service behavior.
 *
 * Required env.json keys under PetMedicalRecordFunction:
 *   JWT_SECRET, JWT_BYPASS, ALLOWED_ORIGINS, MONGODB_URI
 *
 * Optional fixture keys for Tier 2:
 *   TEST_PET_ID         - live pet owned by TEST_OWNER_USER_ID
 *   TEST_OWNER_USER_ID  - owner userId for TEST_PET_ID
 *   TEST_NGO_ID         - ngoId attached to TEST_PET_ID for NGO access checks
 */

const jwt = require("../functions/PetMedicalRecord/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

jest.setTimeout(30000);

const BASE_URL = "http://localhost:3000";
const config = envConfig.PetMedicalRecordFunction || {};

const JWT_SECRET = config.JWT_SECRET;
const VALID_ORIGIN = (config.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")[0]
  .trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";

const TEST_PET_ID = config.TEST_PET_ID || "";
const TEST_OWNER_USER_ID = config.TEST_OWNER_USER_ID || "";
const TEST_NGO_ID = config.TEST_NGO_ID || "";

const NONEXISTENT_PET_ID = "000000000000000000000001";
const NONEXISTENT_RECORD_ID = "000000000000000000000002";
const NONEXISTENT_OTHER_RECORD_ID = "000000000000000000000003";
const STRANGER_USER_ID = "000000000000000000000099";
const FIXTURE_TEST_TIMEOUT_MS = 60000;

const ownerTest = TEST_PET_ID && TEST_OWNER_USER_ID ? test : test.skip;
const ngoTest = TEST_PET_ID && TEST_NGO_ID ? test : test.skip;

const state = {
  medicalRecordId: "",
  medicalShapeRecordId: "",
  medicationRecordId: "",
  dewormRecordId: "",
  bloodTestRecordId: "",
};

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
  const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const fakePayload = Buffer.from(JSON.stringify({ userId: TEST_OWNER_USER_ID || STRANGER_USER_ID })).toString("base64url");
  return {
    Authorization: `Bearer ${fakeHeader}.${fakePayload}.`,
  };
}

async function req(method, path, body, headers = {}, extra = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      ...headers,
    },
    body: body !== undefined
      ? (typeof body === "string" ? body : JSON.stringify(body))
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
  if (!TEST_PET_ID || !TEST_OWNER_USER_ID) return;

  const ownerHeaders = ownerAuth();

  if (state.medicalRecordId) {
    await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medical-record/${state.medicalRecordId}`,
      undefined,
      ownerHeaders
    ).catch(() => {});
  }

  if (state.medicalShapeRecordId) {
    await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medical-record/${state.medicalShapeRecordId}`,
      undefined,
      ownerHeaders
    ).catch(() => {});
  }

  if (state.medicationRecordId) {
    await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medication-record/${state.medicationRecordId}`,
      undefined,
      ownerHeaders
    ).catch(() => {});
  }

  if (state.dewormRecordId) {
    await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/deworm-record/${state.dewormRecordId}`,
      undefined,
      ownerHeaders
    ).catch(() => {});
  }

  if (state.bloodTestRecordId) {
    await req(
      "DELETE",
      `/v2/pets/${TEST_PET_ID}/blood-test-record/${state.bloodTestRecordId}`,
      undefined,
      ownerHeaders
    ).catch(() => {});
  }
}

afterAll(async () => {
  await cleanupCreatedRecords();
});

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(`${BASE_URL}/pets/${NONEXISTENT_PET_ID}/medical-record`, {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(`${BASE_URL}/pets/${NONEXISTENT_PET_ID}/medical-record`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });

    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(`${BASE_URL}/pets/${NONEXISTENT_PET_ID}/medical-record`, {
      method: "OPTIONS",
    });

    expect(res.status).toBe(403);
  });
});

describe("JWT authentication", () => {
  test("rejects request with no Authorization header", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/medical-record`);
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects expired JWT", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      undefined,
      expiredAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects garbage Bearer token", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      undefined,
      { Authorization: "Bearer this.is.garbage" }
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects token without Bearer prefix", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      undefined,
      { Authorization: makeToken({ userId: STRANGER_USER_ID }) }
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects tampered JWT signature", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      undefined,
      tamperedAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects alg:none JWT", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      undefined,
      noneAlgAuth()
    );
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("error shape includes success false and requestId", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/medical-record`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(typeof res.body.requestId).toBe("string");
  });

  test("error responses include CORS headers for allowed origin", async () => {
    const res = await req("GET", `/pets/${NONEXISTENT_PET_ID}/medical-record`);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });
});

describe("Guard validation", () => {
  test("rejects malformed JSON body", async () => {
    const res = await req(
      "POST",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      "{bad-json",
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("common.invalidJSON");
  });

  test("rejects empty POST body", async () => {
    const res = await req(
      "POST",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      {},
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("common.missingParams");
  });

  test("rejects invalid petID format", async () => {
    const res = await req(
      "GET",
      "/pets/bad-id/medical-record",
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.invalidPetIdFormat");
  });

  test("rejects invalid record ID format with record-specific key", async () => {
    const res = await req(
      "PUT",
      `/v2/pets/${NONEXISTENT_PET_ID}/blood-test-record/bad-id`,
      { heartworm: "negative" },
      strangerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.bloodTest.invalidBloodTestIdFormat");
  });

  test.each([
    ["/pets/not-an-id/medical-record", "petMedicalRecord.errors.invalidPetIdFormat"],
    ["/pets/not-an-id/medication-record", "petMedicalRecord.errors.invalidPetIdFormat"],
    ["/pets/not-an-id/deworm-record", "petMedicalRecord.errors.invalidPetIdFormat"],
    ["/v2/pets/not-an-id/blood-test-record", "petMedicalRecord.errors.invalidPetIdFormat"],
  ])("GET %s rejects invalid pet id", async (path, errorKey) => {
    const res = await req("GET", path, undefined, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe(errorKey);
  });

  test.each([
    [`/pets/${NONEXISTENT_PET_ID}/medical-record/bad-id`, { medicalPlace: "x" }, "petMedicalRecord.errors.medicalRecord.invalidMedicalIdFormat"],
    [`/pets/${NONEXISTENT_PET_ID}/medication-record/bad-id`, { drugName: "x" }, "petMedicalRecord.errors.medicationRecord.invalidMedicationIdFormat"],
    [`/pets/${NONEXISTENT_PET_ID}/deworm-record/bad-id`, { frequency: 1 }, "petMedicalRecord.errors.dewormRecord.invalidDewormIdFormat"],
    [`/v2/pets/${NONEXISTENT_PET_ID}/blood-test-record/bad-id`, { heartworm: "negative" }, "petMedicalRecord.errors.bloodTest.invalidBloodTestIdFormat"],
  ])("PUT %s rejects invalid record id", async (path, body, errorKey) => {
    const res = await req("PUT", path, body, strangerAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe(errorKey);
  });
});

describe("Router and nonexistent resource behavior", () => {
  test("returns 404 petNotFound for exact route key with nonexistent pet", async () => {
    const res = await req(
      "GET",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.petNotFound");
  });

  test("returns 403/404 at API layer for unsupported method", async () => {
    const res = await req(
      "PATCH",
      `/pets/${NONEXISTENT_PET_ID}/medical-record`,
      undefined,
      strangerAuth()
    );
    expect([403, 405]).toContain(res.status);
  });
});

describe("Fixture-backed owner and NGO access", () => {
  ownerTest("owner can read medical records on fixture pet", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/medical-record`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form.medical)).toBe(true);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner can read medication records on fixture pet", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/medication-record`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form.medication)).toBe(true);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("stranger gets exact 403 forbidden on fixture pet", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/medical-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("common.forbidden");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ngoTest("matching NGO can read records on fixture pet", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/medical-record`,
      undefined,
      ngoAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form.medical)).toBe(true);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("stranger gets exact 403 on medication route too", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/medication-record`,
      undefined,
      strangerAuth()
    );
    expect(res.status).toBe(403);
    expect(res.body.errorKey).toBe("common.forbidden");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ngoTest("matching NGO can read deworm route", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/deworm-record`,
      undefined,
      ngoAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.form.deworm)).toBe(true);
  }, FIXTURE_TEST_TIMEOUT_MS);
});

describe("Fixture-backed CRUD validation and lifecycle", () => {
  ownerTest("medical create success shape is stable", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/medical-record`,
      {
        medicalDate: "2024-01-16",
        medicalPlace: `Shape Clinic ${Date.now()}`,
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("petMedicalRecord.success.medicalRecord.created");
    expect(res.body.petId).toBe(TEST_PET_ID);
    expect(typeof res.body.medicalRecordId).toBe("string");
    expect(res.body.form._id).toBe(res.body.medicalRecordId);
    state.medicalShapeRecordId = res.body.medicalRecordId;
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medical create rejects impossible ISO date", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/medical-record`,
      {
        medicalDate: "2024-02-31",
        medicalPlace: "Clinic",
      },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.medicalRecord.invalidDateFormat");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner creates medical record successfully", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/medical-record`,
      {
        medicalDate: "2024-01-15",
        medicalPlace: `Jest Clinic ${Date.now()}`,
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.medicalRecordId).toBeTruthy();
    expect(res.body.message).toBe("petMedicalRecord.success.medicalRecord.created");
    state.medicalRecordId = res.body.medicalRecordId;
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medical update rejects empty body with missingParams", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/medical-record/${NONEXISTENT_RECORD_ID}`,
      {},
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("common.missingParams");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medical update rejects unknown fields", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/medical-record/${NONEXISTENT_RECORD_ID}`,
      { hacked: true },
      ownerAuth()
    );
    expect(res.status).toBe(400);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medical update returns 404 on nonexistent record with valid payload", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/medical-record/${NONEXISTENT_RECORD_ID}`,
      { medicalPlace: "Nope" },
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.medicalRecord.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medical update persists empty-string field clears", async () => {
    expect(state.medicalRecordId).toBeTruthy();
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/medical-record/${state.medicalRecordId}`,
      { medicalPlace: "" },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.form.medicalPlace).toBe("");
    expect(res.body.message).toBe("petMedicalRecord.success.medicalRecord.updated");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medication create preserves explicit false allergy", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/medication-record`,
      {
        medicationDate: "2024-01-15",
        drugName: `Drug ${Date.now()}`,
        allergy: false,
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.form.allergy).toBe(false);
    expect(res.body.message).toBe("petMedicalRecord.success.medicationRecord.created");
    state.medicationRecordId = res.body.medicationRecordId;
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medication create rejects invalid date", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/medication-record`,
      {
        medicationDate: "2024-02-31",
        drugName: "A",
      },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.medicationRecord.invalidDateFormat");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medication update rejects unknown fields", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/medication-record/${NONEXISTENT_RECORD_ID}`,
      { credit: 999 },
      ownerAuth()
    );
    expect(res.status).toBe(400);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medication update returns 404 on nonexistent record", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/medication-record/${NONEXISTENT_RECORD_ID}`,
      { drugName: "Nope" },
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.medicationRecord.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner creates deworm record successfully", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/deworm-record`,
      {
        date: "2024-01-15",
        frequency: 3,
        notification: true,
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.dewormRecordId).toBeTruthy();
    expect(res.body.message).toBe("petMedicalRecord.success.dewormRecord.created");
    expect(res.body.form.petId).toBe(TEST_PET_ID);
    state.dewormRecordId = res.body.dewormRecordId;
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("deworm create rejects invalid nextDewormDate", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/deworm-record`,
      {
        date: "2024-01-15",
        nextDewormDate: "2024-02-31",
      },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.dewormRecord.invalidDateFormat");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("deworm update returns 404 on nonexistent record", async () => {
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/deworm-record/${NONEXISTENT_RECORD_ID}`,
      { frequency: 1 },
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.dewormRecord.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("deworm update persists frequency 0 and notification false", async () => {
    expect(state.dewormRecordId).toBeTruthy();
    const res = await req(
      "PUT",
      `/pets/${TEST_PET_ID}/deworm-record/${state.dewormRecordId}`,
      {
        frequency: 0,
        notification: false,
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.form.frequency).toBe(0);
    expect(res.body.form.notification).toBe(false);
    expect(res.body.message).toBe("petMedicalRecord.success.dewormRecord.updated");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner creates blood-test record successfully", async () => {
    const res = await req(
      "POST",
      `/v2/pets/${TEST_PET_ID}/blood-test-record`,
      {
        bloodTestDate: "2024-01-15",
        heartworm: "negative",
      },
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.bloodTestRecordId).toBeTruthy();
    expect(res.body.message).toBe("petMedicalRecord.success.bloodTest.created");
    state.bloodTestRecordId = res.body.bloodTestRecordId;
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("blood-test create rejects invalid date", async () => {
    const res = await req(
      "POST",
      `/v2/pets/${TEST_PET_ID}/blood-test-record`,
      {
        bloodTestDate: "2024-02-31",
        heartworm: "negative",
      },
      ownerAuth()
    );
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.bloodTest.invalidDateFormat");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("blood-test update rejects unknown fields", async () => {
    const res = await req(
      "PUT",
      `/v2/pets/${TEST_PET_ID}/blood-test-record/${NONEXISTENT_RECORD_ID}`,
      { injected: { "$gt": "" } },
      ownerAuth()
    );
    expect(res.status).toBe(400);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("blood-test update returns not-found on nonexistent record", async () => {
    const res = await req(
      "PUT",
      `/v2/pets/${TEST_PET_ID}/blood-test-record/${NONEXISTENT_RECORD_ID}`,
      { heartworm: "negative" },
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.bloodTest.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("blood-test list returns stable success shape", async () => {
    const res = await req(
      "GET",
      `/v2/pets/${TEST_PET_ID}/blood-test-record`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("petMedicalRecord.success.bloodTest.getSuccess");
    expect(Array.isArray(res.body.form.blood_test)).toBe(true);
    expect(res.body.petId).toBe(TEST_PET_ID);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medical delete returns 404 on record mismatch", async () => {
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medical-record/${NONEXISTENT_RECORD_ID}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.medicalRecord.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medication delete returns 404 on record mismatch", async () => {
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medication-record/${NONEXISTENT_RECORD_ID}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.medicationRecord.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("deworm delete returns 404 on record mismatch", async () => {
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/deworm-record/${NONEXISTENT_RECORD_ID}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.dewormRecord.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("blood-test delete returns 404 on record mismatch", async () => {
    const res = await req(
      "DELETE",
      `/v2/pets/${TEST_PET_ID}/blood-test-record/${NONEXISTENT_OTHER_RECORD_ID}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(404);
    expect(res.body.errorKey).toBe("petMedicalRecord.errors.bloodTest.notFound");
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner deletes created medical record successfully", async () => {
    expect(state.medicalRecordId).toBeTruthy();
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medical-record/${state.medicalRecordId}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("petMedicalRecord.success.medicalRecord.deleted");
    expect(res.body.id).toBe(TEST_PET_ID);
    state.medicalRecordId = "";
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner deletes shape-check medical record successfully", async () => {
    expect(state.medicalShapeRecordId).toBeTruthy();
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medical-record/${state.medicalShapeRecordId}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("petMedicalRecord.success.medicalRecord.deleted");
    expect(res.body.id).toBe(TEST_PET_ID);
    state.medicalShapeRecordId = "";
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner deletes created medication record successfully", async () => {
    expect(state.medicationRecordId).toBeTruthy();
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/medication-record/${state.medicationRecordId}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("petMedicalRecord.success.medicationRecord.deleted");
    expect(res.body.id).toBe(TEST_PET_ID);
    state.medicationRecordId = "";
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner deletes created deworm record successfully", async () => {
    expect(state.dewormRecordId).toBeTruthy();
    const res = await req(
      "DELETE",
      `/pets/${TEST_PET_ID}/deworm-record/${state.dewormRecordId}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("petMedicalRecord.success.dewormRecord.deleted");
    expect(res.body.id).toBe(TEST_PET_ID);
    state.dewormRecordId = "";
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("owner deletes created blood-test record successfully", async () => {
    expect(state.bloodTestRecordId).toBeTruthy();
    const res = await req(
      "DELETE",
      `/v2/pets/${TEST_PET_ID}/blood-test-record/${state.bloodTestRecordId}`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("petMedicalRecord.success.bloodTest.deleted");
    expect(res.body.petId).toBe(TEST_PET_ID);
    expect(typeof res.body.bloodTestRecordId).toBe("string");
    state.bloodTestRecordId = "";
  }, FIXTURE_TEST_TIMEOUT_MS);
});

describe("Schema strictness and sanitization", () => {
  ownerTest("strict schema rejects unknown keys", async () => {
    const res = await req(
      "POST",
      `/pets/${TEST_PET_ID}/medical-record`,
      {
        medicalDate: "2024-01-15",
        unknown: "x",
      },
      ownerAuth()
    );
    expect(res.status).toBe(400);
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("sanitized responses do not leak internal fields", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/medical-record`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);

    for (const record of res.body.form.medical) {
      expect(record.__v).toBeUndefined();
      expect(record.createdAt).toBeUndefined();
      expect(record.updatedAt).toBeUndefined();
    }
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("medication responses do not leak internal fields", async () => {
    const res = await req(
      "GET",
      `/pets/${TEST_PET_ID}/medication-record`,
      undefined,
      ownerAuth()
    );
    expect(res.status).toBe(200);

    for (const record of res.body.form.medication) {
      expect(record.__v).toBeUndefined();
      expect(record.createdAt).toBeUndefined();
      expect(record.updatedAt).toBeUndefined();
    }
  }, FIXTURE_TEST_TIMEOUT_MS);

  ownerTest("blood-test strict schema rejects NoSQL-style operator object", async () => {
    const res = await req(
      "POST",
      `/v2/pets/${TEST_PET_ID}/blood-test-record`,
      {
        heartworm: { "$gt": "" },
      },
      ownerAuth()
    );
    expect(res.status).toBe(400);
  }, FIXTURE_TEST_TIMEOUT_MS);
});

describe("Coverage gate", () => {
  test("warns when fixture tests are skipped", () => {
    const missing = [];
    if (!TEST_PET_ID) missing.push("TEST_PET_ID");
    if (!TEST_OWNER_USER_ID) missing.push("TEST_OWNER_USER_ID");
    if (!TEST_NGO_ID) missing.push("TEST_NGO_ID");

    if (missing.length > 0) {
      process.stdout.write(
        `\nWARNING: Missing env.json PetMedicalRecordFunction keys: ${missing.join(", ")}\n` +
        "Fixture-backed owner and NGO tests are skipped.\n" +
        "Fill these values for full UAT CRUD coverage.\n\n"
      );
    }

    expect(true).toBe(true);
  });
});

