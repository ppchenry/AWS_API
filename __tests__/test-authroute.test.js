const authJwt = require("../functions/AuthRoute/node_modules/jsonwebtoken");

function setAuthRouteEnv(overrides = {}) {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = "mongodb://localhost:27017/authroute-test";
  process.env.JWT_SECRET = "authroute-test-secret";
  process.env.ALLOWED_ORIGINS = "http://localhost:3000,https://app.example.com";
  process.env.REFRESH_TOKEN_MAX_AGE_SEC = "1209600";
  process.env.REFRESH_RATE_LIMIT_LIMIT = "2";
  process.env.REFRESH_RATE_LIMIT_WINDOW_SEC = "300";
  Object.assign(process.env, overrides);
}

function makeEvent(overrides = {}) {
  return {
    httpMethod: "POST",
    resource: "/auth/refresh",
    path: "/auth/refresh",
    headers: {
      origin: "http://localhost:3000",
    },
    requestContext: {
      requestId: "req-123",
      stage: "",
    },
    ...overrides,
  };
}

function makeContext() {
  return {
    awsRequestId: "aws-123",
    callbackWaitsForEmptyEventLoop: true,
  };
}

function makeQueryResult(result) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
  };
}

describe("AuthRoute token utilities", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    setAuthRouteEnv();
  });

  test("issues access tokens with modern claims and 15 minute expiry", () => {
    const { issueUserAccessToken } = require("../functions/AuthRoute/src/utils/token");

    const token = issueUserAccessToken({
      _id: { toString: () => "user-123" },
      email: "user@example.com",
      role: "user",
    });

    const decoded = authJwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    expect(decoded.userId).toBe("user-123");
    expect(decoded.userEmail).toBe("user@example.com");
    expect(decoded.userRole).toBe("user");
    expect(decoded.sub).toBeUndefined();
    expect(decoded.email).toBeUndefined();
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  test("builds refresh cookies with strict scoped path", () => {
    const { buildRefreshCookie, readRefreshTokenFromEvent } = require("../functions/AuthRoute/src/utils/token");

    const cookie = buildRefreshCookie("rotated-token", makeEvent({
      requestContext: {
        requestId: "req-123",
        stage: "Dev",
      },
    }));

    expect(cookie).toContain("refreshToken=rotated-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/Dev/auth/refresh");
    expect(cookie).toContain("Max-Age=1209600");

    const parsed = readRefreshTokenFromEvent(makeEvent({
      cookies: ["refreshToken=abc123", "language=en"],
    }));

    expect(parsed).toEqual({ token: "abc123", errorKey: null });
  });
});

describe("AuthRoute handler", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    setAuthRouteEnv();
  });

  test("handles allowed OPTIONS requests without opening the DB", async () => {
    const { handleRequest } = require("../functions/AuthRoute/src/handler");

    const response = await handleRequest(
      makeEvent({ httpMethod: "OPTIONS" }),
      makeContext()
    );

    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });

  test("returns 405 for frozen refresh methods", async () => {
    const getReadConnection = jest.fn().mockResolvedValue({});
    jest.doMock("../functions/AuthRoute/src/config/db", () => ({
      getReadConnection,
    }));

    const { handleRequest } = require("../functions/AuthRoute/src/handler");

    const response = await handleRequest(
      makeEvent({ httpMethod: "PUT" }),
      makeContext()
    );

    const body = JSON.parse(response.body);
    expect(getReadConnection).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(405);
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("others.methodNotAllowed");
  });
});

describe("AuthRoute refresh service", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    setAuthRouteEnv();
  });

  test("returns 429 when refresh attempts are rate limited", async () => {
    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: false, count: 3 }),
    }));

    const { refreshSession } = require("../functions/AuthRoute/src/services/refresh");
    const response = await refreshSession({ event: makeEvent() });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(429);
    expect(body.errorKey).toBe("others.rateLimited");
  });

  test("returns 401 when the refresh token cookie is missing", async () => {
    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    }));

    const { refreshSession } = require("../functions/AuthRoute/src/services/refresh");
    const response = await refreshSession({ event: makeEvent() });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.success).toBe(false);
    expect(body.errorKey).toBe("authRefresh.missingRefreshToken");
  });

  test("returns 401 when the refresh token cookie format is invalid", async () => {
    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    }));

    const { refreshSession } = require("../functions/AuthRoute/src/services/refresh");
    const response = await refreshSession({
      event: makeEvent({
        headers: {
          origin: "http://localhost:3000",
          cookie: "session=abc",
        },
      }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.errorKey).toBe("authRefresh.invalidRefreshTokenCookie");
  });

  test("rejects invalid sessions when the token record is missing", async () => {
    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    }));

    const mongoose = require("../functions/AuthRoute/node_modules/mongoose");
    jest.spyOn(mongoose, "model").mockImplementation((name) => {
      if (name === "RefreshToken") {
        return {
          findOneAndDelete: jest.fn().mockReturnValue(makeQueryResult(null)),
        };
      }
      throw new Error(`Unexpected model lookup: ${name}`);
    });

    const { refreshSession } = require("../functions/AuthRoute/src/services/refresh");
    const response = await refreshSession({
      event: makeEvent({
        headers: {
          origin: "http://localhost:3000",
          cookie: "refreshToken=stale-token",
        },
      }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.errorKey).toBe("authRefresh.invalidSession");
  });

  test("rotates a refresh token, returns a new cookie, and rejects replay", async () => {
    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    }));
    jest.doMock("../functions/AuthRoute/src/utils/token", () => {
      const actual = jest.requireActual("../functions/AuthRoute/src/utils/token");
      return {
        ...actual,
        createRefreshToken: jest.fn().mockResolvedValue({
          token: "rotated-refresh-token",
          expiresAt: new Date("2035-01-01T00:00:00.000Z"),
        }),
      };
    });

    const mongoose = require("../functions/AuthRoute/node_modules/mongoose");
    const deletedRecords = [
      { _id: "token-1", userId: "user-123", expiresAt: new Date(Date.now() + 60_000) },
      null,
    ];

    jest.spyOn(mongoose, "model").mockImplementation((name) => {
      if (name === "RefreshToken") {
        return {
          findOneAndDelete: jest.fn().mockImplementation(() => makeQueryResult(deletedRecords.shift())),
        };
      }

      if (name === "User") {
        return {
          findOne: jest.fn().mockReturnValue(makeQueryResult({
            _id: { toString: () => "user-123" },
            email: "user@example.com",
            role: "admin",
          })),
        };
      }

      throw new Error(`Unexpected model lookup: ${name}`);
    });

    const { refreshSession } = require("../functions/AuthRoute/src/services/refresh");

    const firstResponse = await refreshSession({
      event: makeEvent({
        cookies: ["refreshToken=old-refresh-token", "language=en"],
        requestContext: {
          requestId: "req-123",
          stage: "Production",
        },
      }),
    });
    const firstBody = JSON.parse(firstResponse.body);

    expect(firstResponse.statusCode).toBe(200);
    expect(firstBody.success).toBe(true);
    expect(firstBody.id).toBe("user-123");
    expect(firstResponse.headers["Set-Cookie"]).toContain("refreshToken=rotated-refresh-token");
    expect(firstResponse.headers["Set-Cookie"]).toContain("Path=/Production/auth/refresh");
    expect(firstResponse.headers["Set-Cookie"]).toContain("SameSite=Strict");

    const decoded = authJwt.verify(firstBody.accessToken, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    expect(decoded.userId).toBe("user-123");
    expect(decoded.userEmail).toBe("user@example.com");
    expect(decoded.userRole).toBe("admin");
    expect(decoded.sub).toBeUndefined();
    expect(decoded.email).toBeUndefined();

    const replayResponse = await refreshSession({
      event: makeEvent({
        cookies: ["refreshToken=old-refresh-token"],
      }),
    });
    const replayBody = JSON.parse(replayResponse.body);

    expect(replayResponse.statusCode).toBe(401);
    expect(replayBody.errorKey).toBe("authRefresh.invalidSession");
  });
});
