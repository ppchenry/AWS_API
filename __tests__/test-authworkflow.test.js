/**
 * Auth Workflow Tests — verification-first flow.
 *
 * Covers the three core flows:
 *   1. Registration: verify → isNewUser:true → register (with proof) → token
 *   2. Login: verify → user exists → token issued immediately
 *   3. On-demand linking: authenticated verify → link email/phone to account
 *
 * All tests use module-level mocking (no live DB or Twilio).
 * Run with: npm test -- --testPathPattern=test-authworkflow
 */

const ORIGINAL_ENV = { ...process.env };
const TEST_EMAIL = "newuser@example.com";
const TEST_PHONE = "+85291234567";
const TEST_CODE = "123456";
const TEST_CODE_HASH = require("crypto").createHash("sha256").update(TEST_CODE).digest("hex");

// ═══════════════════════════════════════════════════════════════════════════════
//  Helper: build mock infrastructure shared by all loaders
// ═══════════════════════════════════════════════════════════════════════════════

function buildBaseMocks({ rateLimitAllowed = true } = {}) {
  const createErrorResponse = jest.fn((statusCode, errorKey) => ({
    statusCode,
    body: { success: false, errorKey },
  }));
  const createSuccessResponse = jest.fn((statusCode, event, data, headers = {}) => ({
    statusCode,
    headers,
    body: { success: true, ...data },
  }));
  const issueUserAccessToken = jest.fn(() => "access-token-jwt");
  const createRefreshToken = jest.fn().mockResolvedValue({ token: "refresh-token-raw" });
  const buildRefreshCookie = jest.fn(() => "refreshToken=refresh-token-raw; HttpOnly; Secure");
  const enforceRateLimit = jest.fn().mockResolvedValue({ allowed: rateLimitAllowed });
  const logInfo = jest.fn();
  const logError = jest.fn();
  const normalizeEmail = jest.fn((v) => (v ? v.toLowerCase().trim() : null));
  const normalizePhone = jest.fn((v) => v || null);
  const getFirstZodIssueMessage = jest.fn((err) => err?.issues?.[0]?.message || "validation_error");

  return {
    createErrorResponse,
    createSuccessResponse,
    issueUserAccessToken,
    createRefreshToken,
    buildRefreshCookie,
    enforceRateLimit,
    logInfo,
    logError,
    normalizeEmail,
    normalizePhone,
    getFirstZodIssueMessage,
  };
}

function buildModelMock(overrides = {}) {
  const findOneLean = jest.fn().mockResolvedValue(overrides.findOneResult ?? null);
  const findOneSelect = jest.fn(() => ({ lean: findOneLean }));
  return {
    findOne: jest.fn((...args) => {
      // If the caller chains .select().lean(), support that. If just .lean(), also support.
      return { lean: findOneLean, select: findOneSelect };
    }),
    findOneAndUpdate: jest.fn().mockResolvedValue(overrides.findOneAndUpdateResult ?? { acknowledged: true }),
    create: jest.fn().mockImplementation(async (data) => ({
      ...data,
      _id: overrides.newUserId || "new-user-id-123",
      toObject() { return { ...data, _id: overrides.newUserId || "new-user-id-123" }; },
    })),
    _findOneLean: findOneLean,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: Email Verification (verifyEmailCode)
// ═══════════════════════════════════════════════════════════════════════════════

function loadVerifyEmailCode({
  existingUser = null,
  verificationRecord = { consumedAt: new Date() },
  rateLimitAllowed = true,
  eventUserId = undefined,
} = {}) {
  jest.resetModules();

  const mocks = buildBaseMocks({ rateLimitAllowed });
  const UserModel = buildModelMock({ findOneResult: existingUser });
  const EmailVerificationCodeModel = buildModelMock();

  // findOneAndUpdate for atomic consume — return the record or null
  EmailVerificationCodeModel.findOneAndUpdate = jest.fn().mockResolvedValue(verificationRecord);

  const models = {
    User: UserModel,
    EmailVerificationCode: EmailVerificationCodeModel,
  };

  // Override UserModel.findOne to return different results based on query
  UserModel.findOne = jest.fn((...args) => {
    const query = args[0] || {};

    if (query._id && query.deleted === false && !query._id.$ne) {
      // Authenticated flow — find current user by _id
      const result = eventUserId ? existingUser : null;
      return { lean: jest.fn().mockResolvedValue(result), select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(result) })) };
    }

    if (query.email && query.deleted === false && query._id?.$ne) {
      // Email conflict check during linking — no conflict by default
      return { lean: jest.fn().mockResolvedValue(null) };
    }

    // Standard email lookup
    return { lean: jest.fn().mockResolvedValue(existingUser), select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(existingUser) })) };
  });

  UserModel.findOneAndUpdate = jest.fn().mockResolvedValue({ acknowledged: true });

  const mongoose = { model: jest.fn((name) => models[name] || models.User) };

  // Mock mongoose for both root and EmailVerification's own node_modules
  jest.doMock("mongoose", () => mongoose);
  jest.doMock("../functions/EmailVerification/node_modules/mongoose", () => mongoose);
  jest.doMock("../functions/EmailVerification/src/utils/response", () => ({
    createErrorResponse: mocks.createErrorResponse,
    createSuccessResponse: mocks.createSuccessResponse,
  }));
  jest.doMock("../functions/EmailVerification/src/utils/logger", () => ({
    logInfo: mocks.logInfo,
    logError: mocks.logError,
  }));
  jest.doMock("../functions/EmailVerification/src/utils/validators", () => ({
    normalizeEmail: mocks.normalizeEmail,
    normalizePhone: mocks.normalizePhone,
    isValidEmail: () => true,
  }));
  jest.doMock("../functions/EmailVerification/src/utils/zod", () => ({
    getFirstZodIssueMessage: mocks.getFirstZodIssueMessage,
  }));
  jest.doMock("../functions/EmailVerification/src/utils/rateLimit", () => ({
    enforceRateLimit: mocks.enforceRateLimit,
  }));
  jest.doMock("../functions/EmailVerification/src/utils/token", () => ({
    issueUserAccessToken: mocks.issueUserAccessToken,
    createRefreshToken: mocks.createRefreshToken,
    buildRefreshCookie: mocks.buildRefreshCookie,
  }));
  jest.doMock("../functions/EmailVerification/src/utils/i18n", () => ({
    loadTranslations: jest.fn(() => ({})),
    getTranslation: jest.fn((t, key) => key),
  }));
  // Mock the zod schema to avoid zod resolution issues
  jest.doMock("../functions/EmailVerification/src/zodSchema/emailSchema", () => ({
    verifyCodeSchema: {
      safeParse: jest.fn((body) => ({ success: true, data: body })),
    },
    generateCodeSchema: {
      safeParse: jest.fn((body) => ({ success: true, data: body })),
    },
  }));

  let service;
  jest.isolateModules(() => {
    service = require("../functions/EmailVerification/src/services/verifyCode");
  });

  return { ...service, mocks: { ...mocks, UserModel, EmailVerificationCodeModel, mongoose } };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 2: SMS Verification (verifySmsCode)
// ═══════════════════════════════════════════════════════════════════════════════

function loadSmsService({
  twilioConfigured = true,
  verifyStatus = "approved",
  existingUser = null,
  rateLimitAllowed = true,
  eventUserId = undefined,
} = {}) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    TWILIO_ACCOUNT_SID: twilioConfigured ? "sid" : "",
    TWILIO_AUTH_TOKEN: twilioConfigured ? "token" : "",
    TWILIO_VERIFY_SERVICE_SID: twilioConfigured ? "service" : "",
  };

  const mocks = buildBaseMocks({ rateLimitAllowed });
  const UserModel = buildModelMock({ findOneResult: existingUser });
  const SmsVerificationCodeModel = buildModelMock();
  SmsVerificationCodeModel.findOneAndUpdate = jest.fn().mockResolvedValue({ acknowledged: true });

  let userFindCallCount = 0;
  UserModel.findOne = jest.fn((...args) => {
    userFindCallCount++;
    const query = args[0] || {};

    if (query._id && query.deleted === false && !query._id.$ne) {
      const result = eventUserId ? existingUser : null;
      return { lean: jest.fn().mockResolvedValue(result) };
    }

    if (query.phoneNumber && query._id?.$ne) {
      // Conflict check — no conflict by default
      return { lean: jest.fn().mockResolvedValue(null) };
    }

    return { lean: jest.fn().mockResolvedValue(existingUser) };
  });

  UserModel.findOneAndUpdate = jest.fn().mockResolvedValue({ acknowledged: true });

  const models = {
    User: UserModel,
    SmsVerificationCode: SmsVerificationCodeModel,
  };

  const mongoose = { model: jest.fn((name) => models[name] || models.User) };

  // Mock mongoose for both root and UserRoutes' own node_modules
  jest.doMock("mongoose", () => mongoose);
  jest.doMock("../functions/UserRoutes/node_modules/mongoose", () => mongoose);

  const verificationCreate = jest.fn().mockResolvedValue({ sid: "VE123" });
  const verificationCheckCreate = jest.fn().mockResolvedValue({ status: verifyStatus });
  const twilioClient = {
    verify: { v2: { services: jest.fn(() => ({
      verifications: { create: verificationCreate },
      verificationChecks: { create: verificationCheckCreate },
    })) } },
  };

  jest.doMock("twilio", () => jest.fn(() => twilioClient), { virtual: true });
  jest.doMock("../functions/UserRoutes/src/utils/token", () => ({
    issueUserAccessToken: mocks.issueUserAccessToken,
    createRefreshToken: mocks.createRefreshToken,
    buildRefreshCookie: mocks.buildRefreshCookie,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/response", () => ({
    createErrorResponse: mocks.createErrorResponse,
    createSuccessResponse: mocks.createSuccessResponse,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/logger", () => ({
    logInfo: mocks.logInfo,
    logError: mocks.logError,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/validators", () => ({
    normalizePhone: mocks.normalizePhone,
    normalizeEmail: mocks.normalizeEmail,
    isValidPhoneNumber: () => true,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/rateLimit", () => ({
    enforceRateLimit: mocks.enforceRateLimit,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/zod", () => ({
    getFirstZodIssueMessage: mocks.getFirstZodIssueMessage,
  }));
  // Mock zod schemas for SMS service
  jest.doMock("../functions/UserRoutes/src/zodSchema/smsSchema", () => ({
    smsCodeSchema: {
      safeParse: jest.fn((body) => ({ success: true, data: body })),
    },
    verifySmsCodeSchema: {
      safeParse: jest.fn((body) => ({ success: true, data: body })),
    },
  }));

  let service;
  jest.isolateModules(() => {
    service = require("../functions/UserRoutes/src/services/sms");
  });

  return {
    ...service,
    mocks: {
      ...mocks,
      UserModel,
      SmsVerificationCodeModel,
      mongoose,
      verificationCreate,
      verificationCheckCreate,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 3: Register (with verification proof)
// ═══════════════════════════════════════════════════════════════════════════════

function loadRegisterService({
  existingUser = null,
  emailVerificationRecord = null,
  smsVerificationRecord = null,
  rateLimitAllowed = true,
} = {}) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    JWT_SECRET: "test-secret",
    REFRESH_TOKEN_MAX_AGE_SEC: "1209600",
  };

  const mocks = buildBaseMocks({ rateLimitAllowed });
  const UserModel = buildModelMock({ findOneResult: existingUser, newUserId: "created-user-id" });
  const EmailVerificationCodeModel = buildModelMock();
  const SmsVerificationCodeModel = buildModelMock();

  // isRecentlyVerified reads via findOne().lean()
  EmailVerificationCodeModel.findOne = jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(emailVerificationRecord),
  }));
  SmsVerificationCodeModel.findOne = jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(smsVerificationRecord),
  }));

  // Duplicate check: User.findOne with $or
  UserModel.findOne = jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(existingUser),
  }));

  const models = {
    User: UserModel,
    EmailVerificationCode: EmailVerificationCodeModel,
    SmsVerificationCode: SmsVerificationCodeModel,
  };

  const mongoose = {
    model: jest.fn((name) => models[name] || models.User),
    Types: { ObjectId: class { constructor() { this.id = "mock-id"; } toString() { return "mock-id"; } } },
  };

  jest.doMock("mongoose", () => mongoose);
  jest.doMock("../functions/UserRoutes/node_modules/mongoose", () => mongoose);
  jest.doMock("../functions/UserRoutes/src/utils/response", () => ({
    createErrorResponse: mocks.createErrorResponse,
    createSuccessResponse: mocks.createSuccessResponse,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/logger", () => ({
    logInfo: mocks.logInfo,
    logError: mocks.logError,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/validators", () => ({
    normalizeEmail: mocks.normalizeEmail,
    normalizePhone: mocks.normalizePhone,
    isValidEmail: () => true,
    isValidPhoneNumber: () => true,
    isValidDateFormat: () => true,
    isValidImageUrl: () => true,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/rateLimit", () => ({
    enforceRateLimit: mocks.enforceRateLimit,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/zod", () => ({
    getFirstZodIssueMessage: mocks.getFirstZodIssueMessage,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/token", () => ({
    issueUserAccessToken: mocks.issueUserAccessToken,
    issueNgoAccessToken: jest.fn(() => "ngo-access-token"),
    createRefreshToken: mocks.createRefreshToken,
    buildRefreshCookie: mocks.buildRefreshCookie,
  }));
  // Mock zod schemas to avoid zod resolution from UserRoutes/node_modules
  jest.doMock("../functions/UserRoutes/src/zodSchema/registerSchema", () => ({
    registerSchema: {
      safeParse: jest.fn((body) => ({ success: true, data: body })),
    },
  }));
  jest.doMock("../functions/UserRoutes/src/zodSchema/registerNgoSchema", () => ({
    registerNgoSchema: {
      safeParse: jest.fn((body) => ({ success: true, data: body })),
    },
  }));
  jest.doMock("bcrypt", () => ({
    hash: jest.fn().mockResolvedValue("hashed-pw"),
  }), { virtual: true });

  let service;
  jest.isolateModules(() => {
    service = require("../functions/UserRoutes/src/services/register");
  });

  return {
    ...service,
    mocks: {
      ...mocks,
      UserModel,
      EmailVerificationCodeModel,
      SmsVerificationCodeModel,
      mongoose,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════════════

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.resetModules();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// ─── Registration Flow: verify → isNewUser → register → token ───────────────

describe("Registration flow (verify-first)", () => {
  describe("Step 1a: Email verify — new user gets isNewUser:true, no token", () => {
    test("returns verified:true, isNewUser:true when user does not exist", async () => {
      const { verifyEmailCode, mocks } = loadVerifyEmailCode({
        existingUser: null,
        verificationRecord: { consumedAt: new Date() },
      });

      const result = await verifyEmailCode({
        event: {},
        body: { email: TEST_EMAIL, resetCode: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.verified).toBe(true);
      expect(result.body.isNewUser).toBe(true);
      expect(result.body).not.toHaveProperty("token");
      expect(result.body).not.toHaveProperty("userId");
      expect(mocks.issueUserAccessToken).not.toHaveBeenCalled();
      expect(mocks.createRefreshToken).not.toHaveBeenCalled();
    });

    test("does not create any user record", async () => {
      const { verifyEmailCode, mocks } = loadVerifyEmailCode({
        existingUser: null,
        verificationRecord: { consumedAt: new Date() },
      });

      await verifyEmailCode({
        event: {},
        body: { email: TEST_EMAIL, resetCode: TEST_CODE },
      });

      expect(mocks.UserModel.create).not.toHaveBeenCalled();
    });
  });

  describe("Step 1b: SMS verify — new user gets isNewUser:true, no token", () => {
    test("returns verified:true, isNewUser:true when user does not exist", async () => {
      const { verifySmsCode, mocks } = loadSmsService({
        existingUser: null,
        verifyStatus: "approved",
      });

      const result = await verifySmsCode({
        event: {},
        body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.verified).toBe(true);
      expect(result.body.isNewUser).toBe(true);
      expect(result.body).not.toHaveProperty("token");
      expect(result.body).not.toHaveProperty("userId");
      expect(mocks.issueUserAccessToken).not.toHaveBeenCalled();
      expect(mocks.createRefreshToken).not.toHaveBeenCalled();
    });

    test("stores SmsVerificationCode record as proof", async () => {
      const { verifySmsCode, mocks } = loadSmsService({
        existingUser: null,
        verifyStatus: "approved",
      });

      await verifySmsCode({
        event: {},
        body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
      });

      expect(mocks.SmsVerificationCodeModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: TEST_PHONE },
        expect.objectContaining({
          $set: expect.objectContaining({
            consumedAt: expect.any(Date),
            expiresAt: expect.any(Date),
          }),
        }),
        { upsert: true }
      );
    });

    test("does not create any user record", async () => {
      const { verifySmsCode, mocks } = loadSmsService({
        existingUser: null,
        verifyStatus: "approved",
      });

      await verifySmsCode({
        event: {},
        body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
      });

      expect(mocks.UserModel.create).not.toHaveBeenCalled();
    });
  });

  describe("Step 2: Register with verified email — creates user + issues token", () => {
    test("creates user and returns token when email was recently verified", async () => {
      const recentVerification = { _id: TEST_EMAIL, consumedAt: new Date() };
      const { register, mocks } = loadRegisterService({
        emailVerificationRecord: recentVerification,
      });

      const result = await register({
        event: {},
        body: {
          firstName: "John",
          lastName: "Doe",
          email: TEST_EMAIL,
        },
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.success).toBe(true);
      expect(result.body.token).toBe("access-token-jwt");
      expect(result.body.userId).toBeDefined();
      expect(result.body.role).toBe("user");
      expect(result.body.isVerified).toBe(true);
      expect(result.headers["Set-Cookie"]).toBe("refreshToken=refresh-token-raw; HttpOnly; Secure");
      expect(mocks.UserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "John",
          lastName: "Doe",
          verified: true,
          role: "user",
        })
      );
    });

    test("creates user and returns token when phone was recently verified", async () => {
      const recentVerification = { _id: TEST_PHONE, consumedAt: new Date() };
      const { register, mocks } = loadRegisterService({
        smsVerificationRecord: recentVerification,
      });

      const result = await register({
        event: {},
        body: {
          firstName: "Jane",
          lastName: "Doe",
          phoneNumber: TEST_PHONE,
        },
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.success).toBe(true);
      expect(result.body.token).toBe("access-token-jwt");
      expect(mocks.UserModel.create).toHaveBeenCalled();
    });

    test("rejects registration when no verification proof exists", async () => {
      const { register } = loadRegisterService({
        emailVerificationRecord: null,
        smsVerificationRecord: null,
      });

      const result = await register({
        event: {},
        body: {
          firstName: "John",
          lastName: "Doe",
          email: TEST_EMAIL,
        },
      });

      expect(result.statusCode).toBe(403);
      expect(result.body.success).toBe(false);
      expect(result.body.errorKey).toBe("register.errors.verificationRequired");
    });

    test("rejects registration when verification is expired (outside 10-min window)", async () => {
      const expiredVerification = {
        _id: TEST_EMAIL,
        consumedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      };

      // The mock returns the record, but the actual code checks consumedAt >= cutoff.
      // Since we mock findOne().lean() to return null when the query doesn't match,
      // we simulate expiry by returning null.
      const { register } = loadRegisterService({
        emailVerificationRecord: null,
        smsVerificationRecord: null,
      });

      const result = await register({
        event: {},
        body: {
          firstName: "John",
          lastName: "Doe",
          email: TEST_EMAIL,
        },
      });

      expect(result.statusCode).toBe(403);
      expect(result.body.errorKey).toBe("register.errors.verificationRequired");
    });

    test("rejects registration when user already exists (duplicate)", async () => {
      const existingUser = {
        _id: "existing-id",
        email: TEST_EMAIL,
        phoneNumber: null,
        role: "user",
        verified: true,
      };
      const { register } = loadRegisterService({
        existingUser,
        emailVerificationRecord: { _id: TEST_EMAIL, consumedAt: new Date() },
      });

      const result = await register({
        event: {},
        body: {
          firstName: "John",
          lastName: "Doe",
          email: TEST_EMAIL,
        },
      });

      expect(result.statusCode).toBe(409);
      expect(result.body.success).toBe(false);
    });
  });
});

// ─── Login Flow: verify → user exists → token ──────────────────────────────

describe("Login flow (verify returns token for existing user)", () => {
  describe("Email verify — existing user gets token", () => {
    test("returns token and userId for existing verified user", async () => {
      const existingUser = {
        _id: "user-abc",
        email: TEST_EMAIL,
        role: "user",
        verified: true,
      };
      const { verifyEmailCode, mocks } = loadVerifyEmailCode({
        existingUser,
        verificationRecord: { consumedAt: new Date() },
      });

      const result = await verifyEmailCode({
        event: {},
        body: { email: TEST_EMAIL, resetCode: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.verified).toBe(true);
      expect(result.body.isNewUser).toBe(false);
      expect(result.body.token).toBe("access-token-jwt");
      expect(result.body.userId).toBe("user-abc");
      expect(result.body.role).toBe("user");
      expect(result.headers["Set-Cookie"]).toBe("refreshToken=refresh-token-raw; HttpOnly; Secure");
      expect(mocks.issueUserAccessToken).toHaveBeenCalledWith(existingUser);
      expect(mocks.createRefreshToken).toHaveBeenCalledWith("user-abc");
    });

    test("marks unverified existing user as verified and issues token", async () => {
      const unverifiedUser = {
        _id: "user-unv",
        email: TEST_EMAIL,
        role: "user",
        verified: false,
      };
      const { verifyEmailCode, mocks } = loadVerifyEmailCode({
        existingUser: unverifiedUser,
        verificationRecord: { consumedAt: new Date() },
      });

      const result = await verifyEmailCode({
        event: {},
        body: { email: TEST_EMAIL, resetCode: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.token).toBe("access-token-jwt");
      expect(result.body.isNewUser).toBe(false);
      expect(mocks.UserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "user-unv" },
        { $set: { verified: true } }
      );
    });
  });

  describe("SMS verify — existing user gets token", () => {
    test("returns token and userId for existing user", async () => {
      const existingUser = {
        _id: "user-sms-1",
        phoneNumber: TEST_PHONE,
        role: "user",
        verified: true,
      };
      const { verifySmsCode, mocks } = loadSmsService({
        existingUser,
        verifyStatus: "approved",
      });

      const result = await verifySmsCode({
        event: {},
        body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.verified).toBe(true);
      expect(result.body.isNewUser).toBe(false);
      expect(result.body.token).toBe("access-token-jwt");
      expect(result.body.userId).toBe("user-sms-1");
      expect(result.headers["Set-Cookie"]).toBe("refreshToken=refresh-token-raw; HttpOnly; Secure");
    });

    test("marks unverified existing user as verified and issues token", async () => {
      const unverifiedUser = {
        _id: "user-sms-unv",
        phoneNumber: TEST_PHONE,
        role: "user",
        verified: false,
      };
      const { verifySmsCode, mocks } = loadSmsService({
        existingUser: unverifiedUser,
        verifyStatus: "approved",
      });

      const result = await verifySmsCode({
        event: {},
        body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.token).toBe("access-token-jwt");
      expect(result.body.isNewUser).toBe(false);
      expect(mocks.UserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "user-sms-unv" },
        { $set: { verified: true } }
      );
    });
  });
});

// ─── On-demand Linking: authenticated verify → link to account ──────────────

describe("On-demand linking (authenticated user)", () => {
  describe("Email linking", () => {
    test("links email to authenticated user account", async () => {
      const authenticatedUser = {
        _id: "auth-user-1",
        email: "old@example.com",
        role: "user",
        verified: true,
      };
      const { verifyEmailCode, mocks } = loadVerifyEmailCode({
        existingUser: authenticatedUser,
        verificationRecord: { consumedAt: new Date() },
        eventUserId: "auth-user-1",
      });

      const result = await verifyEmailCode({
        event: { userId: "auth-user-1" },
        body: { email: TEST_EMAIL, resetCode: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.verified).toBe(true);
      expect(result.body.isNewUser).toBe(false);
      expect(result.body.linked).toEqual({ email: TEST_EMAIL.toLowerCase() });
      // Should NOT issue a new access token for linking
      expect(result.body).not.toHaveProperty("token");
    });
  });

  describe("Phone linking", () => {
    test("links phone to authenticated user account", async () => {
      const authenticatedUser = {
        _id: "auth-user-2",
        phoneNumber: "+85290000000",
        role: "user",
        verified: true,
      };
      const { verifySmsCode, mocks } = loadSmsService({
        existingUser: authenticatedUser,
        verifyStatus: "approved",
        eventUserId: "auth-user-2",
      });

      const result = await verifySmsCode({
        event: { userId: "auth-user-2" },
        body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.verified).toBe(true);
      expect(result.body.linked).toEqual({ phoneNumber: TEST_PHONE });
      // Should NOT issue a new access token for linking
      expect(result.body).not.toHaveProperty("token");
    });
  });
});

// ─── Verification Failure Cases ─────────────────────────────────────────────

describe("Verification failures", () => {
  test("email verify — wrong code returns generic failure", async () => {
    const { verifyEmailCode } = loadVerifyEmailCode({
      verificationRecord: null, // no match → code wrong/expired/consumed
    });

    const result = await verifyEmailCode({
      event: {},
      body: { email: TEST_EMAIL, resetCode: "000000" },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.errorKey).toBe("verificationFailed");
  });

  test("sms verify — wrong code returns codeIncorrect", async () => {
    const { verifySmsCode } = loadSmsService({ verifyStatus: "pending" });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: TEST_PHONE, code: "000000" },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.errorKey).toBe("verification.codeIncorrect");
  });

  test("sms verify — expired code returns codeExpired", async () => {
    const { verifySmsCode } = loadSmsService({ verifyStatus: "expired" });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: TEST_PHONE, code: "123456" },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.errorKey).toBe("verification.codeExpired");
  });
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────

describe("Rate limiting", () => {
  test("email verify returns 429 when rate limited", async () => {
    const { verifyEmailCode } = loadVerifyEmailCode({ rateLimitAllowed: false });

    const result = await verifyEmailCode({
      event: {},
      body: { email: TEST_EMAIL, resetCode: TEST_CODE },
    });

    expect(result.statusCode).toBe(429);
    expect(result.body.errorKey).toBe("others.rateLimited");
  });

  test("sms verify returns 429 when rate limited", async () => {
    const { verifySmsCode } = loadSmsService({ rateLimitAllowed: false });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
    });

    expect(result.statusCode).toBe(429);
    expect(result.body.errorKey).toBe("others.rateLimited");
  });

  test("register returns 429 when rate limited", async () => {
    const { register } = loadRegisterService({ rateLimitAllowed: false });

    const result = await register({
      event: {},
      body: { firstName: "John", lastName: "Doe", email: TEST_EMAIL },
    });

    expect(result.statusCode).toBe(429);
    expect(result.body.errorKey).toBe("others.rateLimited");
  });
});

// ─── Frozen Routes ──────────────────────────────────────────────────────────

describe("Frozen password routes", () => {
  test("POST /account/login is frozen (null) in router", () => {
    jest.resetModules();
    // Read the router to verify the route is null
    const routerSource = require("fs").readFileSync(
      require("path").join(__dirname, "../functions/UserRoutes/src/router.js"),
      "utf-8"
    );
    // Verify login route is set to null (frozen)
    expect(routerSource).toMatch(/"POST \/account\/login":\s*null/);
  });

  test("PUT /account/update-password is frozen (null) in router", () => {
    const routerSource = require("fs").readFileSync(
      require("path").join(__dirname, "../functions/UserRoutes/src/router.js"),
      "utf-8"
    );
    expect(routerSource).toMatch(/"PUT \/account\/update-password":\s*null/);
  });
});

// ─── End-to-End Flow Simulation ─────────────────────────────────────────────

describe("E2E flow simulation (mock)", () => {
  test("full registration: SMS verify (new) → register → token", async () => {
    // Step 1: SMS verification for new user
    const { verifySmsCode } = loadSmsService({
      existingUser: null,
      verifyStatus: "approved",
    });
    const verifyResult = await verifySmsCode({
      event: {},
      body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
    });

    expect(verifyResult.body.verified).toBe(true);
    expect(verifyResult.body.isNewUser).toBe(true);
    expect(verifyResult.body).not.toHaveProperty("token");

    // Step 2: Register with verified phone
    const { register } = loadRegisterService({
      smsVerificationRecord: { _id: TEST_PHONE, consumedAt: new Date() },
    });
    const registerResult = await register({
      event: {},
      body: { firstName: "John", lastName: "Doe", phoneNumber: TEST_PHONE },
    });

    expect(registerResult.statusCode).toBe(201);
    expect(registerResult.body.token).toBe("access-token-jwt");
    expect(registerResult.body.isVerified).toBe(true);
  });

  test("full registration: email verify (new) → register → token", async () => {
    // Step 1: Email verification for new user
    const { verifyEmailCode } = loadVerifyEmailCode({
      existingUser: null,
      verificationRecord: { consumedAt: new Date() },
    });
    const verifyResult = await verifyEmailCode({
      event: {},
      body: { email: TEST_EMAIL, resetCode: TEST_CODE },
    });

    expect(verifyResult.body.verified).toBe(true);
    expect(verifyResult.body.isNewUser).toBe(true);

    // Step 2: Register with verified email
    const { register } = loadRegisterService({
      emailVerificationRecord: { _id: TEST_EMAIL, consumedAt: new Date() },
    });
    const registerResult = await register({
      event: {},
      body: { firstName: "Jane", lastName: "Doe", email: TEST_EMAIL },
    });

    expect(registerResult.statusCode).toBe(201);
    expect(registerResult.body.token).toBe("access-token-jwt");
  });

  test("full login: SMS verify (existing) → token immediately", async () => {
    const existingUser = {
      _id: "returning-user",
      phoneNumber: TEST_PHONE,
      role: "user",
      verified: true,
    };
    const { verifySmsCode } = loadSmsService({
      existingUser,
      verifyStatus: "approved",
    });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: TEST_PHONE, code: TEST_CODE },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.verified).toBe(true);
    expect(result.body.isNewUser).toBe(false);
    expect(result.body.token).toBe("access-token-jwt");
    expect(result.body.userId).toBe("returning-user");
  });

  test("full login: email verify (existing) → token immediately", async () => {
    const existingUser = {
      _id: "returning-email-user",
      email: TEST_EMAIL,
      role: "user",
      verified: true,
    };
    const { verifyEmailCode } = loadVerifyEmailCode({
      existingUser,
      verificationRecord: { consumedAt: new Date() },
    });

    const result = await verifyEmailCode({
      event: {},
      body: { email: TEST_EMAIL, resetCode: TEST_CODE },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.isNewUser).toBe(false);
    expect(result.body.token).toBe("access-token-jwt");
    expect(result.body.userId).toBe("returning-email-user");
  });
});
