const ORIGINAL_ENV = { ...process.env };
const USER_PHONE = "+85252668385";

function loadSmsService({
  twilioConfigured = true,
  verifyStatus = "approved",
  existingUser = null,
  rateLimitAllowed = true,
} = {}) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    TWILIO_ACCOUNT_SID: twilioConfigured ? "sid" : "",
    TWILIO_AUTH_TOKEN: twilioConfigured ? "token" : "",
    TWILIO_VERIFY_SERVICE_SID: twilioConfigured ? "service" : "",
  };

  const verificationCreate = jest.fn().mockResolvedValue({ sid: "VE123" });
  const verificationCheckCreate = jest.fn().mockResolvedValue({ status: verifyStatus });
  const twilioClient = {
    verify: {
      v2: {
        services: jest.fn(() => ({
          verifications: {
            create: verificationCreate,
          },
          verificationChecks: {
            create: verificationCheckCreate,
          },
        })),
      },
    },
  };

  const createErrorResponse = jest.fn((statusCode, errorKey) => ({
    statusCode,
    body: { success: false, errorKey },
  }));
  const createSuccessResponse = jest.fn((statusCode, event, data, headers = {}) => ({
    statusCode,
    headers,
    body: { success: true, ...data },
  }));
  const issueUserAccessToken = jest.fn(() => "access-token");
  const createRefreshToken = jest.fn().mockResolvedValue({ token: "refresh-token" });
  const buildRefreshCookie = jest.fn(() => "refreshToken=refresh-token");
  const enforceRateLimit = jest.fn().mockResolvedValue({ allowed: rateLimitAllowed });
  const normalizePhone = jest.fn((value) => value);
  const logError = jest.fn();

  const findOneLean = jest.fn().mockResolvedValue(existingUser);
  const UserModel = {
    findOne: jest.fn(() => ({ lean: findOneLean })),
    findOneAndUpdate: jest.fn().mockResolvedValue({ acknowledged: true }),
  };
  const mongoose = {
    model: jest.fn(() => UserModel),
  };

  jest.doMock("twilio", () => jest.fn(() => twilioClient), { virtual: true });
  jest.doMock("mongoose", () => mongoose);
  jest.doMock("../functions/UserRoutes/node_modules/mongoose", () => mongoose);
  jest.doMock("../functions/UserRoutes/src/utils/token", () => ({
    issueUserAccessToken,
    createRefreshToken,
    buildRefreshCookie,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/response", () => ({
    createErrorResponse,
    createSuccessResponse,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/logger", () => ({
    logError,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/validators", () => ({
    normalizePhone,
    isValidPhoneNumber: () => true,
  }));
  jest.doMock("../functions/UserRoutes/src/utils/rateLimit", () => ({
    enforceRateLimit,
  }));

  let service;
  jest.isolateModules(() => {
    service = require("../functions/UserRoutes/src/services/sms");
  });

  return {
    ...service,
    mocks: {
      verificationCreate,
      verificationCheckCreate,
      createErrorResponse,
      createSuccessResponse,
      issueUserAccessToken,
      createRefreshToken,
      buildRefreshCookie,
      enforceRateLimit,
      normalizePhone,
      logError,
      UserModel,
      mongoose,
      findOneLean,
    },
  };
}

describe("UserRoutes SMS service", () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.resetModules();
    jest.clearAllMocks();
    jest.unmock("mongoose");
    jest.unmock("../functions/UserRoutes/node_modules/mongoose");
    jest.unmock("../functions/UserRoutes/src/utils/token");
    jest.unmock("../functions/UserRoutes/src/utils/response");
    jest.unmock("../functions/UserRoutes/src/utils/logger");
    jest.unmock("../functions/UserRoutes/src/utils/validators");
    jest.unmock("../functions/UserRoutes/src/utils/rateLimit");
  });

  test("generateSmsCode sends a verification request via Twilio", async () => {
    const { generateSmsCode, mocks } = loadSmsService();

    const result = await generateSmsCode({
      event: {},
      body: { phoneNumber: USER_PHONE },
    });

    expect(result.statusCode).toBe(201);
    expect(result.body.message).toBe("SMS code sent successfully");
    expect(mocks.verificationCreate).toHaveBeenCalledWith({
      to: USER_PHONE,
      channel: "sms",
    });
  });

  test("generateSmsCode returns 503 when Twilio is not configured", async () => {
    const { generateSmsCode } = loadSmsService({ twilioConfigured: false });

    const result = await generateSmsCode({
      event: {},
      body: { phoneNumber: USER_PHONE },
    });

    expect(result.statusCode).toBe(503);
    expect(result.body.errorKey).toBe("others.serviceUnavailable");
  });

  test("verifySmsCode marks an existing unverified user as verified and issues tokens", async () => {
    const user = {
      _id: "user-1",
      phoneNumber: USER_PHONE,
      role: "user",
      verified: false,
    };
    const { verifySmsCode, mocks } = loadSmsService({ existingUser: user });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: USER_PHONE, code: "123456" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.token).toBe("access-token");
    expect(result.body.userId).toBe("user-1");
    expect(result.body.role).toBe("user");
    expect(result.body.isVerified).toBe(true);
    expect(result.headers["Set-Cookie"]).toBe("refreshToken=refresh-token");
    expect(mocks.UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "user-1" },
      { $set: { verified: true } }
    );
    expect(mocks.issueUserAccessToken).toHaveBeenCalledWith(user);
    expect(mocks.createRefreshToken).toHaveBeenCalledWith("user-1");
  });

  test("verifySmsCode does not rewrite verified users", async () => {
    const user = {
      _id: "user-2",
      phoneNumber: USER_PHONE,
      role: "user",
      verified: true,
    };
    const { verifySmsCode, mocks } = loadSmsService({ existingUser: user });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: USER_PHONE, code: "123456" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.userId).toBe("user-2");
    expect(result.body.role).toBe("user");
    expect(result.body.isVerified).toBe(true);
    expect(mocks.UserModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("verifySmsCode rejects verified phones that do not belong to a registered account", async () => {
    const { verifySmsCode } = loadSmsService({ existingUser: null });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: USER_PHONE, code: "123456" },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.errorKey).toBe("verification.codeIncorrect");
  });

  test("verifySmsCode maps expired Twilio status to codeExpired", async () => {
    const { verifySmsCode } = loadSmsService({ verifyStatus: "expired" });

    const result = await verifySmsCode({
      event: {},
      body: { phoneNumber: USER_PHONE, code: "123456" },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.errorKey).toBe("verification.codeExpired");
  });
});