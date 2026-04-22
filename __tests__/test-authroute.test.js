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

  test("issues NGO access tokens with ngoId and ngoName claims", () => {
    const { issueNgoAccessToken } = require("../functions/AuthRoute/src/utils/token");

    const token = issueNgoAccessToken(
      {
        _id: { toString: () => "user-123" },
        email: "ngo@example.com",
        role: "ngo",
      },
      {
        _id: { toString: () => "ngo-999" },
        name: "Rescue Org",
      }
    );

    const decoded = authJwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    expect(decoded.userId).toBe("user-123");
    expect(decoded.userEmail).toBe("ngo@example.com");
    expect(decoded.userRole).toBe("ngo");
    expect(decoded.ngoId).toBe("ngo-999");
    expect(decoded.ngoName).toBe("Rescue Org");
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

  test("returns 405 for unmapped methods (Lambda safety net, not deployed in API Gateway)", async () => {
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
    expect(body.errorKey).toBe("common.methodNotAllowed");
  });

  test("POST /auth/refresh reaches the service through the full handler lifecycle", async () => {
    const getReadConnection = jest.fn().mockResolvedValue({});
    jest.doMock("../functions/AuthRoute/src/config/db", () => ({
      getReadConnection,
    }));

    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    }));

    const { handleRequest } = require("../functions/AuthRoute/src/handler");

    const response = await handleRequest(
      makeEvent({
        headers: { origin: "http://localhost:3000" },
      }),
      makeContext()
    );

    const body = JSON.parse(response.body);
    expect(getReadConnection).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(401);
    expect(body.errorKey).toBe("authRoute.errors.missingRefreshToken");
  });

  test("POST /auth/refresh bypasses authJWT because it is in PUBLIC_RESOURCES", async () => {
    const getReadConnection = jest.fn().mockResolvedValue({});
    jest.doMock("../functions/AuthRoute/src/config/db", () => ({
      getReadConnection,
    }));

    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    }));

    const { handleRequest } = require("../functions/AuthRoute/src/handler");

    // No Authorization header — authJWT would return 401, but PUBLIC_RESOURCES skips it
    const response = await handleRequest(
      makeEvent({
        headers: { origin: "http://localhost:3000" },
      }),
      makeContext()
    );

    const body = JSON.parse(response.body);
    // Should reach the refresh service (401 from missing cookie), NOT 401 from authJWT
    expect(response.statusCode).toBe(401);
    expect(body.errorKey).toBe("authRoute.errors.missingRefreshToken");
    expect(body.errorKey).not.toBe("common.unauthorized");
  });

  test("non-public resource returns 401 when Authorization header is missing", async () => {
    // Hypothetical: if a protected route were added, authJWT would block it.
    // We test this by sending a request to a resource NOT in PUBLIC_RESOURCES.
    const getReadConnection = jest.fn().mockResolvedValue({});
    jest.doMock("../functions/AuthRoute/src/config/db", () => ({
      getReadConnection,
    }));

    const { handleRequest } = require("../functions/AuthRoute/src/handler");

    const response = await handleRequest(
      makeEvent({
        resource: "/auth/some-protected-route",
        headers: { origin: "http://localhost:3000" },
      }),
      makeContext()
    );

    const body = JSON.parse(response.body);
    expect(getReadConnection).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
    expect(body.errorKey).toBe("common.unauthorized");
  });
});

describe("AuthRoute authJWT middleware", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    setAuthRouteEnv();
  });

  test("returns null for OPTIONS requests without inspecting headers", () => {
    const { authJWT } = require("../functions/AuthRoute/src/middleware/authJWT");

    const result = authJWT({ event: makeEvent({ httpMethod: "OPTIONS" }) });
    expect(result).toBeNull();
  });

  test("returns null and attaches identity for a valid Bearer token", () => {
    const { authJWT } = require("../functions/AuthRoute/src/middleware/authJWT");

    const token = authJwt.sign(
      { userId: "user-456", userEmail: "test@example.com", userRole: "user" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    const event = makeEvent({
      headers: {
        origin: "http://localhost:3000",
        Authorization: `Bearer ${token}`,
      },
    });

    const result = authJWT({ event });
    expect(result).toBeNull();
    expect(event.userId).toBe("user-456");
    expect(event.userEmail).toBe("test@example.com");
    expect(event.userRole).toBe("user");
    expect(event.user).toBeDefined();
    expect(event.requestContext.authorizer).toBeDefined();
  });

  test("returns 401 for a malformed Bearer header", () => {
    const { authJWT } = require("../functions/AuthRoute/src/middleware/authJWT");

    const result = authJWT({
      event: makeEvent({
        headers: {
          origin: "http://localhost:3000",
          Authorization: "NotBearer some-token",
        },
      }),
    });

    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(401);
    expect(body.errorKey).toBe("common.unauthorized");
  });

  test("returns 401 for an expired or tampered token", () => {
    const { authJWT } = require("../functions/AuthRoute/src/middleware/authJWT");

    const expiredToken = authJwt.sign(
      { userId: "user-789" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-1s" }
    );

    const result = authJWT({
      event: makeEvent({
        headers: {
          origin: "http://localhost:3000",
          Authorization: `Bearer ${expiredToken}`,
        },
      }),
    });

    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(401);
    expect(body.errorKey).toBe("common.unauthorized");
  });

  test("returns 500 when JWT_SECRET is not available at request time", () => {
    // JWT_SECRET is present at module load (env validation passes),
    // but cleared before the request to simulate a missing-secret branch.
    const { authJWT } = require("../functions/AuthRoute/src/middleware/authJWT");

    const savedSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      const result = authJWT({
        event: makeEvent({
          headers: {
            origin: "http://localhost:3000",
            Authorization: "Bearer some-token",
          },
        }),
      });

      const body = JSON.parse(result.body);
      expect(result.statusCode).toBe(500);
      expect(body.errorKey).toBe("common.internalError");
    } finally {
      process.env.JWT_SECRET = savedSecret;
    }
  });

  test("JWT_BYPASS attaches dev identity in non-production", () => {
    setAuthRouteEnv({ JWT_BYPASS: "true", NODE_ENV: "test" });
    const { authJWT } = require("../functions/AuthRoute/src/middleware/authJWT");

    const event = makeEvent({
      headers: { origin: "http://localhost:3000" },
    });

    const result = authJWT({ event });
    expect(result).toBeNull();
    expect(event.userId).toBe("dev-user-id");
    expect(event.userEmail).toBe("dev@test.com");
    expect(event.userRole).toBe("developer");
  });

  test("JWT_BYPASS is ignored when NODE_ENV is production", () => {
    setAuthRouteEnv({ JWT_BYPASS: "true", NODE_ENV: "production" });
    const { authJWT } = require("../functions/AuthRoute/src/middleware/authJWT");

    const result = authJWT({
      event: makeEvent({
        headers: { origin: "http://localhost:3000" },
      }),
    });

    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(401);
    expect(body.errorKey).toBe("common.unauthorized");
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
    expect(body.errorKey).toBe("common.rateLimited");
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
    expect(body.errorKey).toBe("authRoute.errors.missingRefreshToken");
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
    expect(body.errorKey).toBe("authRoute.errors.invalidRefreshTokenCookie");
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
    expect(body.errorKey).toBe("authRoute.errors.invalidSession");
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
    expect(replayBody.errorKey).toBe("authRoute.errors.invalidSession");
  });

  test("preserves NGO claims when refreshing an NGO session", async () => {
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
    jest.spyOn(mongoose, "model").mockImplementation((name) => {
      if (name === "RefreshToken") {
        return {
          findOneAndDelete: jest.fn().mockReturnValue(makeQueryResult({
            _id: "token-ngo-1",
            userId: "user-ngo-123",
            expiresAt: new Date(Date.now() + 60_000),
          })),
        };
      }

      if (name === "User") {
        return {
          findOne: jest.fn().mockReturnValue(makeQueryResult({
            _id: { toString: () => "user-ngo-123" },
            email: "ngo@example.com",
            role: "ngo",
          })),
        };
      }

      if (name === "NgoUserAccess") {
        return {
          findOne: jest.fn().mockReturnValue(makeQueryResult({
            ngoId: { toString: () => "ngo-abc" },
          })),
        };
      }

      if (name === "NGO") {
        return {
          findOne: jest.fn().mockReturnValue(makeQueryResult({
            _id: { toString: () => "ngo-abc" },
            name: "Pet Rescue HK",
            isActive: true,
            isVerified: true,
          })),
        };
      }

      throw new Error(`Unexpected model lookup: ${name}`);
    });

    const { refreshSession } = require("../functions/AuthRoute/src/services/refresh");
    const response = await refreshSession({
      event: makeEvent({
        cookies: ["refreshToken=old-refresh-token"],
      }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);

    const decoded = authJwt.verify(body.accessToken, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    expect(decoded.userId).toBe("user-ngo-123");
    expect(decoded.userRole).toBe("ngo");
    expect(decoded.ngoId).toBe("ngo-abc");
    expect(decoded.ngoName).toBe("Pet Rescue HK");
  });

  test("rejects NGO refresh when the NGO is no longer approved", async () => {
    jest.doMock("../functions/AuthRoute/src/utils/rateLimit", () => ({
      enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    }));

    const mongoose = require("../functions/AuthRoute/node_modules/mongoose");
    jest.spyOn(mongoose, "model").mockImplementation((name) => {
      if (name === "RefreshToken") {
        return {
          findOneAndDelete: jest.fn().mockReturnValue(makeQueryResult({
            _id: "token-ngo-2",
            userId: "user-ngo-456",
            expiresAt: new Date(Date.now() + 60_000),
          })),
        };
      }

      if (name === "User") {
        return {
          findOne: jest.fn().mockReturnValue(makeQueryResult({
            _id: { toString: () => "user-ngo-456" },
            email: "ngo2@example.com",
            role: "ngo",
          })),
        };
      }

      if (name === "NgoUserAccess") {
        return {
          findOne: jest.fn().mockReturnValue(makeQueryResult({
            ngoId: { toString: () => "ngo-disabled" },
          })),
        };
      }

      if (name === "NGO") {
        return {
          findOne: jest.fn().mockReturnValue(makeQueryResult({
            _id: { toString: () => "ngo-disabled" },
            name: "Paused NGO",
            isActive: true,
            isVerified: false,
          })),
        };
      }

      throw new Error(`Unexpected model lookup: ${name}`);
    });

    const { refreshSession } = require("../functions/AuthRoute/src/services/refresh");
    const response = await refreshSession({
      event: makeEvent({
        cookies: ["refreshToken=old-refresh-token"],
      }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(403);
    expect(body.errorKey).toBe("authRoute.errors.ngoApprovalRequired");
  });
});
