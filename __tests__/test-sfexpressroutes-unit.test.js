const jwt = require("../functions/SFExpressRoutes/node_modules/jsonwebtoken");
const envConfig = require("../env.json");

const VALID_ORIGIN = "http://localhost:3000";

function setSfExpressEnv(overrides = {}) {
  const cfg = envConfig.SFExpressRoutesFunction;
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = cfg.MONGODB_URI || "mongodb://localhost:27017/sfexpress-test";
  process.env.JWT_SECRET = cfg.JWT_SECRET;
  process.env.JWT_BYPASS = cfg.JWT_BYPASS || "false";
  process.env.ALLOWED_ORIGINS = cfg.ALLOWED_ORIGINS || VALID_ORIGIN;
  process.env.SF_CUSTOMER_CODE = cfg.SF_CUSTOMER_CODE || "test-customer";
  process.env.SF_PRODUCTION_CHECK_CODE = cfg.SF_PRODUCTION_CHECK_CODE || "test-check-code";
  process.env.SF_SANDBOX_CHECK_CODE = cfg.SF_SANDBOX_CHECK_CODE || "test-sandbox-check-code";
  process.env.SMTP_FROM = cfg.SMTP_FROM || "support@test.com";
  process.env.SMTP_HOST = cfg.SMTP_HOST || "smtp.test.com";
  process.env.SMTP_PASS = cfg.SMTP_PASS || "secret";
  process.env.SMTP_PORT = cfg.SMTP_PORT || "465";
  process.env.SMTP_USER = cfg.SMTP_USER || "support@test.com";
  process.env.SF_ADDRESS_API_KEY = cfg.SF_ADDRESS_API_KEY || "address-api-key";
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
    awsRequestId: "aws-123",
    ...overrides,
  };
}

function makeContext() {
  return {
    awsRequestId: "aws-123",
    callbackWaitsForEmptyEventLoop: true,
  };
}

function allowRateLimit() {
  jest.doMock("../functions/SFExpressRoutes/src/utils/rateLimit", () => ({
    enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true, count: 1 }),
    getClientIp: jest.fn().mockReturnValue("198.51.100.10"),
    toWindowStart: jest.fn(),
  }));
}

describe("SFExpressRoutes service failure coverage", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    setSfExpressEnv();
    allowRateLimit();
  });

  test("getToken returns 500 when SF_ADDRESS_API_KEY is missing", async () => {
    setSfExpressEnv({ SF_ADDRESS_API_KEY: "" });
    const { getToken } = require("../functions/SFExpressRoutes/src/services/sfMetadata");

    const response = await getToken({
      event: makeEvent(),
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("common.internalError");
  });

  test("getToken returns 500 when address token fetch throws", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/services/sfAddressClient", () => ({
      fetchAddressToken: jest.fn().mockRejectedValue(new Error("boom")),
      fetchAreaList: jest.fn(),
      fetchNetCodeList: jest.fn(),
      fetchPickupAddresses: jest.fn(),
    }));

    const { getToken } = require("../functions/SFExpressRoutes/src/services/sfMetadata");
    const response = await getToken({
      event: makeEvent(),
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("common.internalError");
  });

  test("getArea returns 500 when upstream call throws", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/services/sfAddressClient", () => ({
      fetchAddressToken: jest.fn(),
      fetchAreaList: jest.fn().mockRejectedValue(new Error("boom")),
      fetchNetCodeList: jest.fn(),
      fetchPickupAddresses: jest.fn(),
    }));

    const { getArea } = require("../functions/SFExpressRoutes/src/services/sfMetadata");
    const response = await getArea({
      event: makeEvent({
        resource: "/sf-express-routes/get-area",
        path: "/sf-express-routes/get-area",
      }),
      body: { token: "live-token" },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("common.internalError");
  });

  test("getNetCode returns 500 when upstream call throws", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/services/sfAddressClient", () => ({
      fetchAddressToken: jest.fn(),
      fetchAreaList: jest.fn(),
      fetchNetCodeList: jest.fn().mockRejectedValue(new Error("boom")),
      fetchPickupAddresses: jest.fn(),
    }));

    const { getNetCode } = require("../functions/SFExpressRoutes/src/services/sfMetadata");
    const response = await getNetCode({
      event: makeEvent({
        resource: "/sf-express-routes/get-netCode",
        path: "/sf-express-routes/get-netCode",
      }),
      body: { token: "live-token", typeId: 1, areaId: 2 },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("common.internalError");
  });

  test("getPickupLocations returns 500 when upstream call throws", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/services/sfAddressClient", () => ({
      fetchAddressToken: jest.fn(),
      fetchAreaList: jest.fn(),
      fetchNetCodeList: jest.fn(),
      fetchPickupAddresses: jest.fn().mockRejectedValue(new Error("boom")),
    }));

    const { getPickupLocations } = require("../functions/SFExpressRoutes/src/services/sfMetadata");
    const response = await getPickupLocations({
      event: makeEvent({
        resource: "/sf-express-routes/get-pickup-locations",
        path: "/sf-express-routes/get-pickup-locations",
      }),
      body: { token: "live-token", netCode: ["852A"], lang: "en" },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("common.internalError");
  });

  test("createOrder returns 500 sfExpress.errors.sfApiError when SF service call fails", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/config/db", () => ({
      connectToMongoDB: jest.fn(),
      getReadConnection: jest.fn().mockResolvedValue({
        model: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }));

    jest.doMock("../functions/SFExpressRoutes/src/services/sfExpressClient", () => ({
      getAccessToken: jest.fn().mockResolvedValue("access-token"),
      callSfService: jest.fn().mockRejectedValue(new Error("sfExpressRoutes.errors.sfApiError")),
    }));

    const { createOrder } = require("../functions/SFExpressRoutes/src/services/sfOrder");
    const response = await createOrder({
      event: makeEvent({
        resource: "/sf-express-routes/create-order",
        path: "/sf-express-routes/create-order",
        userEmail: "sfexpress@test.com",
        userRole: "user",
      }),
      body: {
        lastName: "Chan",
        phoneNumber: "91234567",
        address: "Tsuen Wan",
      },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("sfExpressRoutes.errors.sfApiError");
  });

  test("createOrder returns 500 when SF response is missing waybill", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/config/db", () => ({
      connectToMongoDB: jest.fn(),
      getReadConnection: jest.fn().mockResolvedValue({
        model: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }));

    jest.doMock("../functions/SFExpressRoutes/src/services/sfExpressClient", () => ({
      getAccessToken: jest.fn().mockResolvedValue("access-token"),
      callSfService: jest.fn().mockResolvedValue({
        msgData: { waybillNoInfoList: [] },
      }),
    }));

    const { createOrder } = require("../functions/SFExpressRoutes/src/services/sfOrder");
    const response = await createOrder({
      event: makeEvent({
        resource: "/sf-express-routes/create-order",
        path: "/sf-express-routes/create-order",
        userEmail: "sfexpress@test.com",
        userRole: "user",
      }),
      body: {
        lastName: "Chan",
        phoneNumber: "91234567",
        address: "Tsuen Wan",
      },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("sfExpressRoutes.errors.missingWaybill");
  });

  test("printCloudWaybill returns 500 sfExpress.errors.invalidSfResponse when SF payload is malformed", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/services/sfExpressClient", () => ({
      SF_CLOUD_PRINT_URL: "https://example.com/cloud-print",
      getAccessToken: jest.fn().mockResolvedValue("access-token"),
      callSfService: jest.fn().mockRejectedValue(new Error("sfExpressRoutes.errors.invalidSfResponse")),
      downloadPdf: jest.fn(),
    }));

    const { printCloudWaybill } = require("../functions/SFExpressRoutes/src/services/sfWaybill");
    const response = await printCloudWaybill({
      event: makeEvent({
        resource: "/v2/sf-express-routes/print-cloud-waybill",
        path: "/v2/sf-express-routes/print-cloud-waybill",
      }),
      body: { waybillNo: "SF1234567890" },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("sfExpressRoutes.errors.invalidSfResponse");
  });

  test("printCloudWaybill returns 500 when SF response has no files", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/services/sfExpressClient", () => ({
      SF_CLOUD_PRINT_URL: "https://example.com/cloud-print",
      getAccessToken: jest.fn().mockResolvedValue("access-token"),
      callSfService: jest.fn().mockResolvedValue({
        success: true,
        obj: { files: [] },
      }),
      downloadPdf: jest.fn(),
    }));

    const { printCloudWaybill } = require("../functions/SFExpressRoutes/src/services/sfWaybill");
    const response = await printCloudWaybill({
      event: makeEvent({
        resource: "/v2/sf-express-routes/print-cloud-waybill",
        path: "/v2/sf-express-routes/print-cloud-waybill",
      }),
      body: { waybillNo: "SF1234567890" },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("sfExpressRoutes.errors.missingPrintFile");
  });

  test("printCloudWaybill returns 500 others.internalError when email send fails", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/services/sfExpressClient", () => ({
      SF_CLOUD_PRINT_URL: "https://example.com/cloud-print",
      getAccessToken: jest.fn().mockResolvedValue("access-token"),
      callSfService: jest.fn().mockResolvedValue({
        success: true,
        obj: {
          files: [{ url: "https://example.com/file.pdf", token: "file-token" }],
        },
      }),
      downloadPdf: jest.fn().mockResolvedValue(Buffer.from("pdf")),
    }));

    jest.doMock("../functions/SFExpressRoutes/src/services/sfMail", () => ({
      sendWaybillEmail: jest.fn().mockRejectedValue(new Error("smtp down")),
    }));

    const { printCloudWaybill } = require("../functions/SFExpressRoutes/src/services/sfWaybill");
    const response = await printCloudWaybill({
      event: makeEvent({
        resource: "/v2/sf-express-routes/print-cloud-waybill",
        path: "/v2/sf-express-routes/print-cloud-waybill",
      }),
      body: { waybillNo: "SF1234567890" },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("common.internalError");
  });
});

describe("SFExpressRoutes middleware and handler hardening", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    setSfExpressEnv();
    allowRateLimit();
  });

  test("authJWT attaches identity for a valid Bearer token", () => {
    const { authJWT } = require("../functions/SFExpressRoutes/src/middleware/authJWT");

    const token = jwt.sign(
      { userId: "user-123", userEmail: "user@test.com", userRole: "ngo" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    const event = makeEvent({
      headers: {
        Authorization: `Bearer ${token}`,
        origin: VALID_ORIGIN,
      },
    });

    const result = authJWT({ event });
    expect(result).toBeNull();
    expect(event.userId).toBe("user-123");
    expect(event.userEmail).toBe("user@test.com");
    expect(event.userRole).toBe("ngo");
  });

  test("authJWT supports lowercase authorization header", () => {
    const { authJWT } = require("../functions/SFExpressRoutes/src/middleware/authJWT");

    const token = jwt.sign(
      { userId: "user-123", userEmail: "user@test.com", userRole: "user" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    const event = makeEvent({
      headers: {
        authorization: `Bearer ${token}`,
        origin: VALID_ORIGIN,
      },
    });

    const result = authJWT({ event });
    expect(result).toBeNull();
    expect(event.userId).toBe("user-123");
  });

  test("handler rejects create-order unknown fields -> 400", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/config/db", () => ({
      getReadConnection: jest.fn().mockResolvedValue({}),
    }));

    const { handleRequest } = require("../functions/SFExpressRoutes/src/handler");
    const token = jwt.sign(
      { userId: "user-123", userEmail: "user@test.com", userRole: "user" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    const response = await handleRequest(
      makeEvent({
        resource: "/sf-express-routes/create-order",
        path: "/sf-express-routes/create-order",
        body: JSON.stringify({
          lastName: "Chan",
          phoneNumber: "91234567",
          address: "Tsuen Wan",
          role: "admin",
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          origin: VALID_ORIGIN,
        },
      }),
      makeContext()
    );

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(400);
    expect(typeof body.errorKey).toBe("string");
  });

  test("handler returns 500 when DB bootstrap throws", async () => {
    jest.doMock("../functions/SFExpressRoutes/src/config/db", () => ({
      getReadConnection: jest.fn().mockRejectedValue(new Error("db down")),
    }));

    const { handleRequest } = require("../functions/SFExpressRoutes/src/handler");
    const token = jwt.sign(
      { userId: "user-123", userEmail: "user@test.com", userRole: "user" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    const response = await handleRequest(
      makeEvent({
        headers: {
          Authorization: `Bearer ${token}`,
          origin: VALID_ORIGIN,
        },
      }),
      makeContext()
    );

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.errorKey).toBe("common.internalError");
  });

  test("handler allows JWT bypass only in non-production", async () => {
    setSfExpressEnv({ JWT_BYPASS: "true", NODE_ENV: "test" });

    jest.doMock("../functions/SFExpressRoutes/src/config/db", () => ({
      getReadConnection: jest.fn().mockResolvedValue({}),
    }));

    jest.doMock("../functions/SFExpressRoutes/src/services/sfAddressClient", () => ({
      fetchAddressToken: jest.fn().mockResolvedValue("bypass-token"),
      fetchAreaList: jest.fn(),
      fetchNetCodeList: jest.fn(),
      fetchPickupAddresses: jest.fn(),
    }));

    const { handleRequest } = require("../functions/SFExpressRoutes/src/handler");
    const response = await handleRequest(
      makeEvent(),
      makeContext()
    );

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.bearer_token).toBe("string");
  });
});
