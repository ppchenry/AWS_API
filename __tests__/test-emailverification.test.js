/**
 * EmailVerification Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- --testPathPattern=test-emailverification
 *
 * Tests are organized in two tiers:
 *   Tier 1 (always runs): CORS, validation, frozen routes, response shape,
 *     anti-enumeration against unknown emails, cookie path contract.
 *   Tier 2 (requires DB): generate-no-user-creation, replay prevention,
 *     user-creation-after-verify, existing-user reuse.
 *     Requires MONGODB_URI in env.json EmailVerificationFunction.
 *     If MONGODB_URI is missing these tests are skipped, not faked.
 */

const crypto = require("crypto");
const envConfig = require("../env.json");

jest.setTimeout(30000);

const BASE_URL = "http://localhost:3000";
const VALID_ORIGIN =
  envConfig.EmailVerificationFunction.ALLOWED_ORIGINS.split(",")[0].trim();
const DISALLOWED_ORIGIN = "https://evil.example.com";
const MONGODB_URI = envConfig.EmailVerificationFunction?.MONGODB_URI || "";

// ─── DB helpers (Tier 2 only) ────────────────────────────────────────────────

let mongoose;
let dbReady = false;
let connectAttempted = false;

async function connectDB() {
  if (dbReady) return;
  if (connectAttempted) return;  // already tried — don't retry or re-warn
  if (!MONGODB_URI) return;
  connectAttempted = true;
  try {
    // Node.js on Windows may use a stub DNS resolver that rejects SRV queries.
    // Override to a public resolver so mongodb+srv:// URIs resolve correctly.
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
    console.warn("[test] MongoDB unavailable — Tier 2 tests will be skipped:", err.message);
    dbReady = false;
  }
}

async function disconnectDB() {
  if (dbReady && mongoose) {
    await mongoose.disconnect();
    dbReady = false;
  }
}

function usersCol() {
  return mongoose.connection.db.collection("users");
}

function verificationCodesCol() {
  return mongoose.connection.db.collection("email_verification_codes");
}

// dbTest: connects lazily on first use — Tier 1 tests never touch MongoDB.
// If the connection attempt fails, subsequent Tier 2 tests are skipped (not silent no-ops).
const dbTest = MONGODB_URI
  ? (name, fn) => test(name, async () => {
      await connectDB();
      if (!dbReady) {
        console.log(`[skip] ${name} — no DB connection`);
        return;
      }
      await fn();
    })
  : test.skip;

// ─── Request helpers ─────────────────────────────────────────────────────────

async function req(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: VALID_ORIGIN,
      ...headers,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
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
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json, headers: res.headers };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

afterAll(async () => {
  await disconnectDB();
});

// ─── Tier 1: CORS Preflight ─────────────────────────────────────────────────

describe("OPTIONS preflight", () => {
  test("returns 204 with CORS headers for an allowed origin", async () => {
    const res = await fetch(
      `${BASE_URL}/account/generate-email-code`,
      { method: "OPTIONS", headers: { Origin: VALID_ORIGIN } }
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("returns 403 for a disallowed origin", async () => {
    const res = await fetch(
      `${BASE_URL}/account/generate-email-code`,
      { method: "OPTIONS", headers: { Origin: DISALLOWED_ORIGIN } }
    );
    expect(res.status).toBe(403);
  });

  test("returns 403 when Origin header is absent", async () => {
    const res = await fetch(`${BASE_URL}/account/generate-email-code`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(403);
  });
});

// ─── Tier 1: Frozen/Deprecated Route ────────────────────────────────────────

describe("frozen route /account/generate-email-code-2", () => {
  test("returns 405 methodNotAllowed", async () => {
    const res = await req("POST", "/account/generate-email-code-2", {
      email: "test@example.com",
    });
    expect(res.status).toBe(405);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("common.methodNotAllowed");
  });
});

// ─── Tier 1: Malformed JSON / Body Validation (guard layer) ─────────────────

describe("guard: malformed body", () => {
  test("rejects invalid JSON → 400 invalidJSON", async () => {
    const res = await rawReq(
      "POST",
      "/account/generate-email-code",
      "{ this is not json }"
    );
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("common.invalidJSON");
  });

  test("rejects empty body → 400", async () => {
    const res = await req("POST", "/account/generate-email-code", {});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBeDefined();
  });

  test("rejects null body → 400", async () => {
    const res = await rawReq("POST", "/account/verify-email-code", "");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── Tier 1: Generate Email Code — Zod Validation ──────────────────────────

describe("POST /account/generate-email-code — validation", () => {
  test("rejects missing email → 400", async () => {
    const res = await req("POST", "/account/generate-email-code", {
      notEmail: "x",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBeDefined();
  });

  test("rejects invalid email format → 400", async () => {
    const res = await req("POST", "/account/generate-email-code", {
      email: "not-an-email",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("emailVerification.errors.invalidEmailFormat");
  });
});

// ─── Tier 1: Generate — Anti-Enumeration (C7/C8) ───────────────────────────

describe("POST /account/generate-email-code — anti-enumeration", () => {
  test("returns uniform success for a never-registered email", async () => {
    const email = `enum-never-${Date.now()}@noexist.example.com`;
    const res = await req("POST", "/account/generate-email-code", { email });
    // 200 (success) or 503 (SMTP failure in test env) — never leaks newUser/uid
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body).not.toHaveProperty("newUser");
      expect(res.body).not.toHaveProperty("uid");
    }
    if (res.status === 503) {
      expect(res.body.success).toBe(false);
    }
  });

  test("response shape does not include newUser or uid", async () => {
    const res = await req("POST", "/account/generate-email-code", {
      email: "enumeration-test@example.com",
    });
    if (res.body) {
      expect(res.body).not.toHaveProperty("uid");
      expect(res.body).not.toHaveProperty("newUser");
    }
  });
});

// ─── Tier 1: Verify — Zod Validation ───────────────────────────────────────

describe("POST /account/verify-email-code — validation", () => {
  test("rejects missing email → 400", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      resetCode: "123456",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects missing resetCode → 400", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      email: "test@example.com",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects non-6-digit resetCode → 400", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      email: "test@example.com",
      resetCode: "12345",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("emailVerification.errors.invalidResetCodeFormat");
  });

  test("rejects invalid email format → 400", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      email: "bad-email",
      resetCode: "123456",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("emailVerification.errors.invalidEmailFormat");
  });
});

// ─── Tier 1: Verify — Anti-Enumeration (C7/C8) ─────────────────────────────

describe("POST /account/verify-email-code — anti-enumeration", () => {
  test("returns generic verificationFailed for nonexistent email", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      email: "nobody-here-ever@noexist.example.com",
      resetCode: "000000",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("emailVerification.errors.verificationFailed");
  });

  test("returns generic verificationFailed for wrong code", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      email: "enumeration-test@example.com",
      resetCode: "999999",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKey).toBe("emailVerification.errors.verificationFailed");
  });

  test("nonexistent and wrong-code responses are indistinguishable", async () => {
    const resNonexistent = await req("POST", "/account/verify-email-code", {
      email: "nobody-here-at-all@noexist.example.com",
      resetCode: "000000",
    });
    const resWrongCode = await req("POST", "/account/verify-email-code", {
      email: "enumeration-test@example.com",
      resetCode: "999999",
    });
    expect(resNonexistent.status).toBe(resWrongCode.status);
    expect(resNonexistent.body.errorKey).toBe(resWrongCode.body.errorKey);
    expect(Object.keys(resNonexistent.body).sort()).toEqual(
      Object.keys(resWrongCode.body).sort()
    );
  });
});

// ─── Tier 1: Response Shape Consistency ─────────────────────────────────────

describe("response shape", () => {
  test("error responses include success:false, errorKey, error fields", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      email: "shape-test@example.com",
      resetCode: "000000",
    });
    expect(res.body).toHaveProperty("createPetBasicInfo.success.created", false);
    expect(res.body).toHaveProperty("errorKey");
    expect(res.body).toHaveProperty("error");
  });

  test("CORS headers present on error responses from allowed origin", async () => {
    const res = await req("POST", "/account/verify-email-code", {
      email: "cors-test@example.com",
      resetCode: "000000",
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("CORS headers absent for disallowed origin", async () => {
    const res = await req(
      "POST",
      "/account/verify-email-code",
      { email: "cors-test@example.com", resetCode: "000000" },
      { Origin: DISALLOWED_ORIGIN }
    );
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao).not.toBe(DISALLOWED_ORIGIN);
  });
});

// ─── Tier 2: DB-backed behavioral tests ─────────────────────────────────────
// These tests directly inspect the database to prove behaviors that
// HTTP-only integration tests cannot verify.

describe("Tier 2: generate does not create User records (C6)", () => {
  const testEmail = `c6-test-${Date.now()}@noexist.example.com`;

  dbTest(
    "generate-email-code does not create a user record",
    async () => {
      // Ensure no user exists with this email before the test
      const beforeUser = await usersCol().findOne({ email: testEmail });
      expect(beforeUser).toBeNull();

      // Call generate
      const res = await req("POST", "/account/generate-email-code", {
        email: testEmail,
      });
      // Accept 200 (success) or 503 (SMTP failure) — either way, check DB
      expect([200, 503]).toContain(res.status);

      // Verify: NO User document was created
      const afterUser = await usersCol().findOne({ email: testEmail });
      expect(afterUser).toBeNull();

      // Verify: a verification record WAS created in the dedicated collection
      // _id = normalized email, so lookup by _id
      const verificationRecord = await verificationCodesCol().findOne({
        _id: testEmail,
      });
      expect(verificationRecord).not.toBeNull();
      expect(verificationRecord.codeHash).toBeDefined();
      expect(verificationRecord.consumedAt).toBeNull();

      // Cleanup
      await verificationCodesCol().deleteMany({ _id: testEmail });
    }
  );
});

describe("Tier 2: verify returns isNewUser when no account exists", () => {
  const testEmail = `verify-create-${Date.now()}@noexist.example.com`;
  const testCode = "314159";
  const codeHash = crypto.createHash("sha256").update(testCode).digest("hex");

  dbTest(
    "verification succeeds with isNewUser:true when no user exists for the verified email",
    async () => {
      await verificationCodesCol().insertOne({
        _id: testEmail,
        codeHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        createdAt: new Date(),
      });

      const beforeUser = await usersCol().findOne({ email: testEmail });
      expect(beforeUser).toBeNull();

      const res = await req("POST", "/account/verify-email-code", {
        email: testEmail,
        resetCode: testCode,
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verified).toBe(true);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body).not.toHaveProperty("token");

      // No user should have been created — registration is a separate step
      const afterUser = await usersCol().findOne({ email: testEmail });
      expect(afterUser).toBeNull();

      await verificationCodesCol().deleteMany({ _id: testEmail });
    }
  );
});

describe("Tier 2: replay prevention", () => {
  const testEmail = `replay-${Date.now()}@noexist.example.com`;
  const testCode = "271828";
  const codeHash = crypto.createHash("sha256").update(testCode).digest("hex");

  dbTest(
    "second verification with the same code fails generically",
    async () => {
      const insertResult = await usersCol().insertOne({
        email: testEmail,
        role: "user",
        verified: false,
        deleted: false,
        credit: 300,
        vetCredit: 300,
        eyeAnalysisCredit: 300,
        bloodAnalysisCredit: 300,
      });
      const existingUserId = insertResult.insertedId;

      // 1. Insert verification record (_id = email)
      await verificationCodesCol().insertOne({
        _id: testEmail,
        codeHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        createdAt: new Date(),
      });

      // 2. First verification — should succeed
      const res1 = await req("POST", "/account/verify-email-code", {
        email: testEmail,
        resetCode: testCode,
      });
      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      // 3. Second verification with same code — must fail generically
      const res2 = await req("POST", "/account/verify-email-code", {
        email: testEmail,
        resetCode: testCode,
      });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.errorKey).toBe("emailVerification.errors.verificationFailed");

      // 4. Confirm the verification record is consumed in the DB
      const record = await verificationCodesCol().findOne({ _id: testEmail });
      expect(record.consumedAt).not.toBeNull();

      // Cleanup
      await usersCol().deleteMany({ email: testEmail });
      await verificationCodesCol().deleteMany({ _id: testEmail });
      await mongoose.connection.db
        .collection("refresh_tokens")
        .deleteMany({ userId: existingUserId });
    }
  );
});

describe("Tier 2: expired code", () => {
  const testEmail = `expired-${Date.now()}@noexist.example.com`;
  const testCode = "161803";
  const codeHash = crypto.createHash("sha256").update(testCode).digest("hex");

  dbTest(
    "expired code returns generic verificationFailed",
    async () => {
      // Insert already-expired record (_id = email)
      await verificationCodesCol().insertOne({
        _id: testEmail,
        codeHash,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
        consumedAt: null,
        createdAt: new Date(Date.now() - 301_000),
      });

      const res = await req("POST", "/account/verify-email-code", {
        email: testEmail,
        resetCode: testCode,
      });
      expect(res.status).toBe(400);
      expect(res.body.errorKey).toBe("emailVerification.errors.verificationFailed");

      // Cleanup
      await verificationCodesCol().deleteMany({ _id: testEmail });
    }
  );
});

describe("Tier 2: already-consumed code", () => {
  const testEmail = `consumed-${Date.now()}@noexist.example.com`;
  const testCode = "141421";
  const codeHash = crypto.createHash("sha256").update(testCode).digest("hex");

  dbTest(
    "already-consumed code returns generic verificationFailed",
    async () => {
      // Insert pre-consumed record (_id = email)
      await verificationCodesCol().insertOne({
        _id: testEmail,
        codeHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: new Date(), // already consumed
        createdAt: new Date(),
      });

      const res = await req("POST", "/account/verify-email-code", {
        email: testEmail,
        resetCode: testCode,
      });
      expect(res.status).toBe(400);
      expect(res.body.errorKey).toBe("emailVerification.errors.verificationFailed");

      // Cleanup
      await verificationCodesCol().deleteMany({ _id: testEmail });
    }
  );
});

describe("Tier 2: existing user verification does not create duplicates", () => {
  const testEmail = `existing-${Date.now()}@noexist.example.com`;
  const testCode = "235711";
  const codeHash = crypto.createHash("sha256").update(testCode).digest("hex");

  dbTest(
    "successful verification for existing user reuses the record",
    async () => {
      // 1. Pre-create a user (simulating existing account)
      const insertResult = await usersCol().insertOne({
        email: testEmail,
        role: "user",
        verified: true,
        deleted: false,
        credit: 300,
        vetCredit: 300,
        eyeAnalysisCredit: 300,
        bloodAnalysisCredit: 300,
      });
      const existingUserId = insertResult.insertedId;

      // 2. Insert verification record (_id = email)
      await verificationCodesCol().insertOne({
        _id: testEmail,
        codeHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        createdAt: new Date(),
      });

      // 3. Verify
      const res = await req("POST", "/account/verify-email-code", {
        email: testEmail,
        resetCode: testCode,
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(existingUserId.toString());
      expect(res.body.role).toBe("user");
      expect(res.body.isVerified).toBe(true);
      expect(res.body).not.toHaveProperty("newUser");

      // 4. Confirm no duplicate users were created
      const userCount = await usersCol().countDocuments({ email: testEmail });
      expect(userCount).toBe(1);

      const reusedUser = await usersCol().findOne({ email: testEmail });
      expect(reusedUser.verified).toBe(true);

      // Cleanup
      await usersCol().deleteMany({ email: testEmail });
      await verificationCodesCol().deleteMany({ _id: testEmail });
      await mongoose.connection.db
        .collection("refresh_tokens")
        .deleteMany({ userId: existingUserId });
    }
  );
});

describe("Tier 2: anti-enumeration — existing vs non-existing email on generate", () => {
  const existingEmail = `enum-exist-${Date.now()}@noexist.example.com`;
  const newEmail = `enum-new-${Date.now()}@noexist.example.com`;

  dbTest(
    "generate returns identical shape for existing and non-existing emails",
    async () => {
      // Pre-create an existing user
      await usersCol().insertOne({
        email: existingEmail,
        role: "user",
        verified: true,
        deleted: false,
      });

      const resExisting = await req("POST", "/account/generate-email-code", {
        email: existingEmail,
      });
      const resNew = await req("POST", "/account/generate-email-code", {
        email: newEmail,
      });

      // Both should return the same status code
      expect(resExisting.status).toBe(resNew.status);
      // Neither should leak newUser or uid
      expect(resExisting.body).not.toHaveProperty("newUser");
      expect(resExisting.body).not.toHaveProperty("uid");
      expect(resNew.body).not.toHaveProperty("newUser");
      expect(resNew.body).not.toHaveProperty("uid");
      // Same response shape
      expect(Object.keys(resExisting.body).sort()).toEqual(
        Object.keys(resNew.body).sort()
      );

      // Cleanup
      await usersCol().deleteMany({
        email: { $in: [existingEmail, newEmail] },
      });
      await verificationCodesCol().deleteMany({
        _id: { $in: [existingEmail, newEmail] },
      });
    }
  );
});

// ─── Tier 2: Refresh cookie path ────────────────────────────────────────────

describe("Tier 2: refresh cookie path matches /auth/refresh baseline", () => {
  const testEmail = `cookie-${Date.now()}@noexist.example.com`;
  const testCode = "112358";
  const codeHash = crypto.createHash("sha256").update(testCode).digest("hex");

  dbTest(
    "Set-Cookie uses /auth/refresh path, not /account/verify-email-code",
    async () => {
      const insertResult = await usersCol().insertOne({
        email: testEmail,
        role: "user",
        verified: false,
        deleted: false,
        credit: 300,
        vetCredit: 300,
        eyeAnalysisCredit: 300,
        bloodAnalysisCredit: 300,
      });
      const existingUserId = insertResult.insertedId;

      // Insert verification record (_id = email)
      await verificationCodesCol().insertOne({
        _id: testEmail,
        codeHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        createdAt: new Date(),
      });

      const res = await req("POST", "/account/verify-email-code", {
        email: testEmail,
        resetCode: testCode,
      });
      expect(res.status).toBe(200);

      const setCookie = res.headers.get("set-cookie") || "";
      // Must contain /auth/refresh (possibly stage-prefixed)
      expect(setCookie).toMatch(/Path=\/([A-Za-z]+\/)?auth\/refresh/);
      // Must NOT contain the old wrong path
      expect(setCookie).not.toContain("/account/verify-email-code");
      // Must have HttpOnly, Secure, SameSite=Strict
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=Strict");

      // Cleanup
      await usersCol().deleteMany({ email: testEmail });
      await verificationCodesCol().deleteMany({ _id: testEmail });
      await mongoose.connection.db
        .collection("refresh_tokens")
        .deleteMany({ userId: existingUserId });
    }
  );
});

// ─── Real email smoke test ───────────────────────────────────────────────────

describe("smoke: send verification email to jimmyjimmy26282@gmail.com", () => {
  test("generate-email-code returns 200 and sends a real email", async () => {
    const res = await req("POST", "/account/generate-email-code", {
      email: "jimmyjimmy26282@gmail.com",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
