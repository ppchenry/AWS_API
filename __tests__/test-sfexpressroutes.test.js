/**
 * SFExpressRoutes Jest integration tests.
 * Requires: sam local start-api --env-vars env.json running on port 3000
 * Run with: npm test -- __tests__/test-sfexpressroutes.test.js --runInBand
 */

const jwt = require("../functions/SFExpressRoutes/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

const BASE_URL = "http://localhost:3000";
const VALID_ORIGIN = "http://localhost:3000";
const TEST_TS = Date.now();
const JWT_SECRET = envConfig.SFExpressRoutesFunction.JWT_SECRET;
const MONGODB_URI = envConfig.SFExpressRoutesFunction?.MONGODB_URI || "";
const ENABLE_DB_TESTS = process.env.RUN_SFEXPRESS_DB_TESTS === "true";
const SF_TYPE_ID = envConfig.SFExpressRoutesFunction?.TEST_SF_TYPE_ID || "";
const SF_AREA_ID = envConfig.SFExpressRoutesFunction?.TEST_SF_AREA_ID || "";
const SF_NET_CODE = envConfig.SFExpressRoutesFunction?.TEST_SF_NET_CODE || "";
const SF_WAYBILL_NO = envConfig.SFExpressRoutesFunction?.TEST_SF_WAYBILL_NO || "";
const DEFAULT_TEST_IP = `198.51.120.${(TEST_TS % 200) + 1}`;

let mongoose;
let dbReady = false;
let connectAttempted = false;

async function connectDB() {
  if (dbReady || connectAttempted || !MONGODB_URI) return;
  connectAttempted = true;

  try {
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
    console.warn("[test] MongoDB unavailable - DB-backed SFExpressRoutes checks will be skipped:", err.message);
    dbReady = false;
  }
}

async function disconnectDB() {
  if (dbReady && mongoose) {
    await mongoose.disconnect();
    dbReady = false;
  }
}

const dbTest = ENABLE_DB_TESTS && MONGODB_URI
  ? (name, fn) => test(name, async () => {
      await connectDB();
      if (!dbReady) {
        console.log(`[skip] ${name} - no DB connection`);
        return;
      }
      await fn();
    })
  : test.skip;

function setSfExpressEnv(overrides = {}) {
  const cfg = envConfig.SFExpressRoutesFunction;
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = cfg.MONGODB_URI;
  process.env.JWT_SECRET = cfg.JWT_SECRET;
  process.env.JWT_BYPASS = cfg.JWT_BYPASS || "false";
  process.env.ALLOWED_ORIGINS = cfg.ALLOWED_ORIGINS;
  process.env.SF_CUSTOMER_CODE = cfg.SF_CUSTOMER_CODE;
  process.env.SF_PRODUCTION_CHECK_CODE = cfg.SF_PRODUCTION_CHECK_CODE;
  process.env.SF_SANDBOX_CHECK_CODE = cfg.SF_SANDBOX_CHECK_CODE;
  process.env.SMTP_FROM = cfg.SMTP_FROM;
  process.env.SMTP_HOST = cfg.SMTP_HOST;
  process.env.SMTP_PASS = cfg.SMTP_PASS;
  process.env.SMTP_PORT = cfg.SMTP_PORT;
  process.env.SMTP_USER = cfg.SMTP_USER;
  process.env.SF_ADDRESS_API_KEY = cfg.SF_ADDRESS_API_KEY;
  Object.assign(process.env, overrides);
}

function makeEvent(overrides = {}) {
  return {
    httpMethod: "POST",
    resource: "/sf-express-routes/get-token",
    path: "/sf-express-routes/get-token",
    headers: {
      origin: VALID_ORIGIN,
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

function tokenAuth(overrides = {}) {
  const token = jwt.sign(
    {
      userId: "sfexpress-test-user",
      userEmail: `sfexpress_${TEST_TS}@test.com`,
      userRole: "user",
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

  return { Authorization: `Bearer ${token}` };
}

function expiredAuth(overrides = {}) {
  const token = jwt.sign(
    {
      userId: "sfexpress-test-user",
      userEmail: `sfexpress_${TEST_TS}@test.com`,
      userRole: "user",
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: -60 }
  );

  return { Authorization: `Bearer ${token}` };
}

async function req(method, path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      origin: VALID_ORIGIN,
      "x-forwarded-for": DEFAULT_TEST_IP,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, body: json, headers: res.headers };
}

async function rawReq(method, path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      origin: VALID_ORIGIN,
      "x-forwarded-for": DEFAULT_TEST_IP,
      ...headers,
    },
    body,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, body: json, headers: res.headers };
}

const liveTest = (name, shouldRun, fn) => (
  shouldRun
    ? test(name, fn)
    : test.skip(name, fn)
);

afterAll(async () => {
  await disconnectDB();
});

describe("SFExpressRoutes direct handler and router safety nets", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    setSfExpressEnv();
  });

  test("handles allowed OPTIONS requests without opening the DB", async () => {
    const getReadConnection = jest.fn().mockResolvedValue({});
    jest.doMock("../functions/SFExpressRoutes/src/config/db", () => ({
      getReadConnection,
    }));

    const { handleRequest } = require("../functions/SFExpressRoutes/src/handler");

    const response = await handleRequest(
      makeEvent({
        httpMethod: "OPTIONS",
      }),
      makeContext()
    );

    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe(VALID_ORIGIN);
    expect(getReadConnection).not.toHaveBeenCalled();
  });

  test("returns 405 for unmapped methods via routeRequest safety net", async () => {
    const { routeRequest } = require("../functions/SFExpressRoutes/src/router");

    const response = await routeRequest({
      event: {
        httpMethod: "PUT",
        resource: "/sf-express-routes/get-token",
        path: "/sf-express-routes/get-token",
        headers: { Origin: VALID_ORIGIN },
      },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(405);
    expect(body.errorKey).toBe("common.methodNotAllowed");
  });
});

describe("SFExpressRoutes authentication", () => {
  test("rejects missing Authorization header -> 401", async () => {
    const res = await req("POST", "/sf-express-routes/get-token", {});
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects garbage Authorization token -> 401", async () => {
    const res = await req("POST", "/sf-express-routes/get-token", {}, {
      Authorization: "Bearer this.is.garbage",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects expired JWT -> 401", async () => {
    const res = await req("POST", "/sf-express-routes/get-area", { token: "abc" }, expiredAuth());
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("rejects JWT with wrong algorithm (none) -> 401", async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const fakePayload = Buffer.from(JSON.stringify({
      userId: "sfexpress-test-user",
      userEmail: `sfexpress_${TEST_TS}@test.com`,
      userRole: "user",
    })).toString("base64url");
    const noneToken = `${fakeHeader}.${fakePayload}.`;

    const res = await req("POST", "/sf-express-routes/get-netCode", {
      token: "abc",
      typeId: 1,
      areaId: 2,
    }, {
      Authorization: `Bearer ${noneToken}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });

  test("error response shape includes success, errorKey, error, requestId", async () => {
    const res = await req("POST", "/sf-express-routes/get-token", {});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.errorKey).toBe("string");
    expect(typeof res.body.error).toBe("string");
    expect(typeof res.body.requestId).toBe("string");
  });

  test("CORS headers are present on error responses for allowed origin", async () => {
    const res = await req("POST", "/sf-express-routes/get-token", {});
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe(VALID_ORIGIN);
  });

  test("rejects tampered JWT signature -> 401", async () => {
    const validToken = tokenAuth().Authorization.split(" ")[1];
    const [header, payload] = validToken.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;

    const res = await req("POST", "/sf-express-routes/get-token", {}, {
      Authorization: `Bearer ${tampered}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.errorKey).toBe("common.unauthorized");
  });
});

describe("SFExpressRoutes request guard", () => {
  test("rejects malformed JSON body -> 400", async () => {
    const res = await rawReq("POST", "/sf-express-routes/get-area", '{"token":"broken"', tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("common.invalidJSON");
  });

  test.each([
    ["/sf-express-routes/create-order"],
    ["/sf-express-routes/get-pickup-locations"],
    ["/sf-express-routes/get-area"],
    ["/sf-express-routes/get-netCode"],
    ["/v2/sf-express-routes/print-cloud-waybill"],
  ])("rejects empty body for POST %s -> 400", async (path) => {
    const res = await req("POST", path, {}, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("common.missingParams");
  });

  test("returns 403 for disallowed CORS preflight origin", async () => {
    const res = await fetch(`${BASE_URL}/sf-express-routes/get-token`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://blocked.example.com",
      },
    });

    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("Origin not allowed");
  });
});

describe("POST /sf-express-routes/get-token", () => {
  liveTest("returns address API bearer token -> 200", true, async () => {
    const res = await req("POST", "/sf-express-routes/get-token", {}, tokenAuth({
      userId: `sfexpress-token-${TEST_TS}`,
      userEmail: `sfexpress_token_${TEST_TS}@test.com`,
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.bearer_token).toBe("string");
    expect(res.body.bearer_token.length).toBeGreaterThan(0);
  });
});

describe("POST /sf-express-routes/create-order", () => {
  test("rejects missing lastName -> 400", async () => {
    const res = await req("POST", "/sf-express-routes/create-order", {
      phoneNumber: "91234567",
      address: "Tsuen Wan",
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.lastNameRequired");
  });

  test("rejects missing phoneNumber -> 400", async () => {
    const res = await req("POST", "/sf-express-routes/create-order", {
      lastName: "Chan",
      address: "Tsuen Wan",
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.phoneNumberRequired");
  });

  test("rejects missing address -> 400", async () => {
    const res = await req("POST", "/sf-express-routes/create-order", {
      lastName: "Chan",
      phoneNumber: "91234567",
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.addressRequired");
  });

  dbTest("rejects tempId owned by a different email -> 403", async () => {
    const tempId = `sfexpress-temp-${TEST_TS}`;
    const orders = mongoose.connection.db.collection("order");

    await orders.insertOne({
      lastName: "Owner",
      email: `owner_${TEST_TS}@test.com`,
      phoneNumber: "91234567",
      address: "Seed address",
      tempId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      const res = await req("POST", "/sf-express-routes/create-order", {
        lastName: "Chan",
        phoneNumber: "91234567",
        address: "Tsuen Wan",
        tempId,
      }, tokenAuth({
        userEmail: `other_${TEST_TS}@test.com`,
      }));
      expect(res.status).toBe(403);
      expect(res.body.errorKey).toBe("common.unauthorized");
    } finally {
      await orders.deleteMany({ tempId });
    }
  });

  test("rate limits repeated create-order attempts from the same IP -> 429", async () => {
    const headers = {
      ...tokenAuth(),
      "x-forwarded-for": `198.51.121.${(TEST_TS % 200) + 1}`,
    };

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await req("POST", "/sf-express-routes/create-order", {
        phoneNumber: "91234567",
        address: `Burst Address ${attempt}`,
      }, headers);
    }

    const res = await req("POST", "/sf-express-routes/create-order", {
      phoneNumber: "91234567",
      address: "Blocked Address",
    }, headers);
    expect(res.status).toBe(429);
    expect(res.body.errorKey).toBe("common.rateLimited");
  });
});

describe("POST /sf-express-routes/get-area", () => {
  test("rejects empty token -> 400", async () => {
    const res = await req("POST", "/sf-express-routes/get-area", {
      token: "",
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.tokenRequired");
  });

  liveTest("returns area list -> 200", process.env.RUN_SFEXPRESS_LIVE_TESTS === "true", async () => {
    const tokenRes = await req("POST", "/sf-express-routes/get-token", {}, tokenAuth({
      userId: `sfexpress-live-area-${TEST_TS}`,
      userEmail: `sfexpress_live_area_${TEST_TS}@test.com`,
    }));
    expect(tokenRes.status).toBe(200);

    const res = await req("POST", "/sf-express-routes/get-area", {
      token: tokenRes.body.bearer_token,
    }, tokenAuth({
      userId: `sfexpress-live-area-${TEST_TS}`,
      userEmail: `sfexpress_live_area_${TEST_TS}@test.com`,
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.area_list)).toBe(true);
  });
});

describe("POST /sf-express-routes/get-netCode", () => {
  test("rejects missing typeId -> 400", async () => {
    const res = await req("POST", "/sf-express-routes/get-netCode", {
      token: "abc",
      areaId: 2,
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.typeIdRequired");
  });

  test("rejects missing areaId -> 400", async () => {
    const res = await req("POST", "/sf-express-routes/get-netCode", {
      token: "abc",
      typeId: 1,
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.areaIdRequired");
  });

  liveTest(
    "returns netCode list -> 200",
    process.env.RUN_SFEXPRESS_LIVE_TESTS === "true" && Boolean(SF_TYPE_ID) && Boolean(SF_AREA_ID),
    async () => {
      const authHeaders = tokenAuth({
        userId: `sfexpress-live-netcode-${TEST_TS}`,
        userEmail: `sfexpress_live_netcode_${TEST_TS}@test.com`,
      });
      const tokenRes = await req("POST", "/sf-express-routes/get-token", {}, authHeaders);
      expect(tokenRes.status).toBe(200);

      const res = await req("POST", "/sf-express-routes/get-netCode", {
        token: tokenRes.body.bearer_token,
        typeId: SF_TYPE_ID,
        areaId: SF_AREA_ID,
      }, authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.netCode)).toBe(true);
    }
  );
});

describe("POST /sf-express-routes/get-pickup-locations", () => {
  test("rejects empty netCode array -> 400", async () => {
    const res = await req("POST", "/sf-express-routes/get-pickup-locations", {
      token: "abc",
      netCode: [],
      lang: "en",
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.netCodeListRequired");
  });

  liveTest(
    "returns pickup locations -> 200",
    process.env.RUN_SFEXPRESS_LIVE_TESTS === "true" && Boolean(SF_NET_CODE),
    async () => {
      const authHeaders = tokenAuth({
        userId: `sfexpress-live-pickup-${TEST_TS}`,
        userEmail: `sfexpress_live_pickup_${TEST_TS}@test.com`,
      });
      const tokenRes = await req("POST", "/sf-express-routes/get-token", {}, authHeaders);
      expect(tokenRes.status).toBe(200);

      const res = await req("POST", "/sf-express-routes/get-pickup-locations", {
        token: tokenRes.body.bearer_token,
        netCode: [SF_NET_CODE],
        lang: "en",
      }, authHeaders);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.addresses)).toBe(true);
    }
  );
});

describe("POST /v2/sf-express-routes/print-cloud-waybill", () => {
  test("rejects empty waybillNo -> 400", async () => {
    const res = await req("POST", "/v2/sf-express-routes/print-cloud-waybill", {
      waybillNo: "",
    }, tokenAuth());
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe("sfExpressRoutes.errors.validation.waybillNoRequired");
  });

  liveTest(
    "prints configured waybill -> 200",
    process.env.RUN_SFEXPRESS_LIVE_TESTS === "true" && Boolean(SF_WAYBILL_NO),
    async () => {
      const res = await req("POST", "/v2/sf-express-routes/print-cloud-waybill", {
        waybillNo: SF_WAYBILL_NO,
      }, tokenAuth({
        userId: `sfexpress-live-waybill-${TEST_TS}`,
        userEmail: `sfexpress_live_waybill_${TEST_TS}@test.com`,
      }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.waybillNo).toBe(SF_WAYBILL_NO);
    }
  );
});
