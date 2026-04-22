const mongoose = require("../functions/GetAdoption/node_modules/mongoose");

function makeEvent(overrides = {}) {
  return {
    httpMethod: "GET",
    resource: "/adoption",
    headers: {},
    queryStringParameters: { lang: "en" },
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    awsRequestId: "req-ctx-1",
    callbackWaitsForEmptyEventLoop: true,
    ...overrides,
  };
}

describe("GetAdoption CORS", () => {
  function loadCorsWithOrigins(origins) {
    jest.resetModules();
    process.env.ALLOWED_ORIGINS = origins;
    return require("../functions/GetAdoption/src/cors");
  }

  test("returns 204 with CORS headers for allowed origin", () => {
    const { handleOptions } = loadCorsWithOrigins("https://allowed.example.com");

    const response = handleOptions({
      httpMethod: "OPTIONS",
      headers: { Origin: "https://allowed.example.com" },
      awsRequestId: "req-1",
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://allowed.example.com");
    expect(response.headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  test("returns 403 for disallowed origin", () => {
    const { handleOptions } = loadCorsWithOrigins("https://allowed.example.com");

    const response = handleOptions({
      httpMethod: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
      awsRequestId: "req-2",
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      errorKey: "others.originNotAllowed",
    });
  });

  test("returns translated error body for disallowed origin", () => {
    const { handleOptions } = loadCorsWithOrigins("https://allowed.example.com");

    const response = handleOptions({
      httpMethod: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
      queryStringParameters: { lang: "zh" },
      awsRequestId: "req-3",
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      errorKey: "others.originNotAllowed",
      error: "來源不被允許",
      requestId: "req-3",
    });
  });
});

describe("GetAdoption guard", () => {
  const { validateAdoptionRequest } = require("../functions/GetAdoption/src/middleware/guard");

  test("rejects invalid adoption id format with 400", async () => {
    const result = await validateAdoptionRequest({
      event: {
        httpMethod: "GET",
        resource: "/adoption/{id}",
        pathParameters: { id: "not-an-object-id" },
        queryStringParameters: {},
      },
    });

    expect(result.isValid).toBe(false);
    expect(JSON.parse(result.error.body)).toMatchObject({
      success: false,
      errorKey: "adoption.invalidPetIdFormat",
    });
  });

  test("rejects invalid page values with 400", async () => {
    const result = await validateAdoptionRequest({
      event: {
        httpMethod: "GET",
        resource: "/adoption",
        queryStringParameters: { page: "0" },
      },
    });

    expect(result.isValid).toBe(false);
    expect(JSON.parse(result.error.body)).toMatchObject({
      success: false,
      errorKey: "adoption.invalidPage",
    });
  });

  test("normalizes list filters for valid list requests", async () => {
    const event = {
      httpMethod: "GET",
      resource: "/adoption",
      queryStringParameters: {
        page: "2",
        animal_type: "cat, dog",
        location: "HKI, KLN",
        sex: "F, M",
        age: "幼年,老年",
        search: "shiba",
        lang: "en",
      },
    };

    const result = await validateAdoptionRequest({ event });

    expect(result).toEqual({
      isValid: true,
      query: {
        page: 2,
        search: "shiba",
        animalTypes: ["cat", "dog"],
        locations: ["HKI", "KLN"],
        sexes: ["F", "M"],
        ages: ["幼年", "老年"],
      },
    });
    expect(event.locale).toBe("en");
  });
});

describe("GetAdoption router", () => {
  const { routeRequest } = require("../functions/GetAdoption/src/router");

  test("rejects removed POST route with 405", async () => {
    const response = await routeRequest({
      event: {
        httpMethod: "POST",
        resource: "/adoption/{id}",
        queryStringParameters: { lang: "en" },
      },
    });

    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      errorKey: "others.methodNotAllowed",
    });
  });
});

describe("GetAdoption handler", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("public routes bypass authJWT entirely", async () => {
    const authJWT = jest.fn(() => {
      throw new Error("authJWT should not run for public routes");
    });
    const getReadConnection = jest.fn().mockResolvedValue({});
    const validateAdoptionRequest = jest.fn().mockResolvedValue({
      isValid: true,
      query: { page: 1 },
    });
    const routeRequest = jest.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    });

    jest.doMock("../functions/GetAdoption/src/middleware/authJWT", () => ({ authJWT }));
    jest.doMock("../functions/GetAdoption/src/config/db", () => ({ getReadConnection }));
    jest.doMock("../functions/GetAdoption/src/middleware/guard", () => ({ validateAdoptionRequest }));
    jest.doMock("../functions/GetAdoption/src/router", () => ({ routeRequest }));
    jest.doMock("../functions/GetAdoption/src/config/env", () => ({}));

    const { handleRequest } = require("../functions/GetAdoption/src/handler");

    const response = await handleRequest(
      makeEvent({
        resource: "/adoption/{id}",
        pathParameters: { id: "507f1f77bcf86cd799439011" },
        headers: { Authorization: "Bearer ignored-token" },
      }),
      makeContext()
    );

    expect(response.statusCode).toBe(200);
    expect(authJWT).not.toHaveBeenCalled();
    expect(validateAdoptionRequest).toHaveBeenCalledTimes(1);
    expect(getReadConnection).toHaveBeenCalledTimes(1);
    expect(routeRequest).toHaveBeenCalledTimes(1);
  });
});

describe("GetAdoption services", () => {
  const {
    buildAdoptionListQuery,
    getAdoptionList,
    getAdoptionById,
    LIST_PROJECTION,
    DETAIL_PROJECTION,
  } = require("../functions/GetAdoption/src/services/adoption");

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("buildAdoptionListQuery preserves base filters and escapes search", () => {
    const query = buildAdoptionListQuery({
      locations: ["HKI"],
      ages: ["青年"],
      search: "dog.*",
    });

    expect(query.$and).toEqual([
      { AdoptionSite: { $nin: ["Arc Dog Shelter", "Tolobunny", "HKRABBIT"] } },
      { Image_URL: { $ne: [] } },
      { AdoptionSite: { $in: ["HKI"] } },
      { $or: [{ Age: { $gte: 12, $lte: 36 } }] },
    ]);
    expect(query.$or).toEqual([
      { Breed: { $regex: "dog\\.\\*", $options: "i" } },
      { Animal_Type: { $regex: "dog\\.\\*", $options: "i" } },
      { Remark: { $regex: "dog\\.\\*", $options: "i" } },
    ]);
  });

  test("getAdoptionList returns sanitized success payload", async () => {
    const countDocuments = jest.fn().mockResolvedValue(1);
    const aggregate = jest.fn().mockResolvedValue([
      {
        _id: "adoption-1",
        Name: "Milo",
        Age: 12,
        Sex: "M",
        Breed: "Shiba",
        Image_URL: ["https://example.com/milo.jpg"],
      },
    ]);

    jest.spyOn(mongoose, "model").mockReturnValue({ countDocuments, aggregate });

    const response = await getAdoptionList({
      event: {
        httpMethod: "GET",
        resource: "/adoption",
        queryStringParameters: { lang: "en" },
        headers: { Origin: "https://allowed.example.com" },
        locale: "en",
      },
      query: {
        page: 1,
        search: "milo",
        animalTypes: [],
        locations: [],
        sexes: [],
        ages: [],
      },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.adoptionList).toEqual([
      {
        _id: "adoption-1",
        Name: "Milo",
        Age: 12,
        Sex: "M",
        Breed: "Shiba",
        Image_URL: ["https://example.com/milo.jpg"],
      },
    ]);
    expect(body.totalResult).toBe(1);
    expect(body.maxPage).toBe(1);
    expect(countDocuments).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $project: LIST_PROJECTION }),
      ])
    );
  });

  test("getAdoptionById returns 404 when pet is missing", async () => {
    const lean = jest.fn().mockResolvedValue(null);
    const select = jest.fn().mockReturnValue({ lean });
    const findOne = jest.fn().mockReturnValue({ select });
    jest.spyOn(mongoose, "model").mockReturnValue({ findOne });

    const response = await getAdoptionById({
      event: {
        httpMethod: "GET",
        resource: "/adoption/{id}",
        queryStringParameters: { lang: "en" },
        locale: "en",
      },
      query: { id: "507f1f77bcf86cd799439011" },
    });

    expect(response.statusCode).toBe(404);
    expect(findOne).toHaveBeenCalledWith({ _id: "507f1f77bcf86cd799439011" });
    expect(select).toHaveBeenCalledWith(DETAIL_PROJECTION);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      errorKey: "adoption.petNotFound",
    });
  });
});