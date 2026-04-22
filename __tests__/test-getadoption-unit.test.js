/**
 * GetAdoption unit tests.
 * Tests CORS, guard, router, handler, and service layer directly — no SAM required.
 * Run with: npm test -- --runTestsByPath __tests__/test-getadoption-unit.test.js
 */

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
  return { awsRequestId: "req-ctx-1", callbackWaitsForEmptyEventLoop: true, ...overrides };
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

describe("GetAdoption CORS", () => {
  function loadCors(origins) {
    jest.resetModules();
    process.env.ALLOWED_ORIGINS = origins;
    return require("../functions/GetAdoption/src/cors");
  }

  test("returns 204 with CORS headers for allowed origin", () => {
    const { handleOptions } = loadCors("https://allowed.example.com");
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
    const { handleOptions } = loadCors("https://allowed.example.com");
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

  test("returns translated zh error body for disallowed origin", () => {
    const { handleOptions } = loadCors("https://allowed.example.com");
    const response = handleOptions({
      httpMethod: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
      queryStringParameters: { lang: "zh" },
      awsRequestId: "req-3",
    });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.errorKey).toBe("others.originNotAllowed");
    expect(body.requestId).toBe("req-3");
  });

  test("returns null (no response) for non-OPTIONS request — caller proceeds", () => {
    const { handleOptions } = loadCors("https://allowed.example.com");
    const response = handleOptions({
      httpMethod: "GET",
      headers: { Origin: "https://allowed.example.com" },
      awsRequestId: "req-4",
    });
    expect(response).toBeUndefined();
  });
});

// ─── Guard ────────────────────────────────────────────────────────────────────

describe("GetAdoption guard", () => {
  const { validateAdoptionRequest } = require("../functions/GetAdoption/src/middleware/guard");

  test("rejects invalid adoption id format → 400", async () => {
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

  test("rejects page value of 0 → 400", async () => {
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

  test("rejects non-numeric page value → 400", async () => {
    const result = await validateAdoptionRequest({
      event: {
        httpMethod: "GET",
        resource: "/adoption",
        queryStringParameters: { page: "abc" },
      },
    });
    expect(result.isValid).toBe(false);
    expect(JSON.parse(result.error.body)).toMatchObject({
      success: false,
      errorKey: "adoption.invalidPage",
    });
  });

  test("rejects search string exceeding 100 characters → 400", async () => {
    const result = await validateAdoptionRequest({
      event: {
        httpMethod: "GET",
        resource: "/adoption",
        queryStringParameters: { search: "a".repeat(101) },
      },
    });
    expect(result.isValid).toBe(false);
    expect(JSON.parse(result.error.body)).toMatchObject({
      success: false,
      errorKey: "adoption.invalidSearch",
    });
  });

  test("normalizes list filters for valid list request", async () => {
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
    expect(result.isValid).toBe(true);
    expect(result.query).toEqual({
      page: 2,
      search: "shiba",
      animalTypes: ["cat", "dog"],
      locations: ["HKI", "KLN"],
      sexes: ["F", "M"],
      ages: ["幼年", "老年"],
    });
    expect(event.locale).toBe("en");
  });

  test("defaults to page 1 when page param is absent", async () => {
    const result = await validateAdoptionRequest({
      event: {
        httpMethod: "GET",
        resource: "/adoption",
        queryStringParameters: {},
      },
    });
    expect(result.isValid).toBe(true);
    expect(result.query.page).toBe(1);
  });

  test("accepts valid ObjectId for detail route", async () => {
    const result = await validateAdoptionRequest({
      event: {
        httpMethod: "GET",
        resource: "/adoption/{id}",
        pathParameters: { id: "507f1f77bcf86cd799439011" },
        queryStringParameters: { lang: "en" },
      },
    });
    expect(result.isValid).toBe(true);
    expect(result.query.id).toBe("507f1f77bcf86cd799439011");
  });
});

// ─── Router ───────────────────────────────────────────────────────────────────

describe("GetAdoption router", () => {
  const { routeRequest } = require("../functions/GetAdoption/src/router");

  test("returns 405 for removed POST /adoption/{id} route", async () => {
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

  test("returns 405 for DELETE /adoption route", async () => {
    const response = await routeRequest({
      event: {
        httpMethod: "DELETE",
        resource: "/adoption",
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

// ─── Handler ──────────────────────────────────────────────────────────────────

describe("GetAdoption handler", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("public routes bypass authJWT entirely", async () => {
    const authJWT = jest.fn(() => {
      throw new Error("authJWT must not run for public routes");
    });
    const getReadConnection = jest.fn().mockResolvedValue({});
    const validateAdoptionRequest = jest.fn().mockResolvedValue({ isValid: true, query: { page: 1 } });
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

  test("propagates guard error without calling routeRequest", async () => {
    const guardError = {
      statusCode: 400,
      body: JSON.stringify({ success: false, errorKey: "adoption.invalidPetIdFormat" }),
    };
    const validateAdoptionRequest = jest.fn().mockResolvedValue({ isValid: false, error: guardError });
    const routeRequest = jest.fn();

    jest.doMock("../functions/GetAdoption/src/middleware/authJWT", () => ({ authJWT: jest.fn() }));
    jest.doMock("../functions/GetAdoption/src/config/db", () => ({ getReadConnection: jest.fn().mockResolvedValue({}) }));
    jest.doMock("../functions/GetAdoption/src/middleware/guard", () => ({ validateAdoptionRequest }));
    jest.doMock("../functions/GetAdoption/src/router", () => ({ routeRequest }));
    jest.doMock("../functions/GetAdoption/src/config/env", () => ({}));

    const { handleRequest } = require("../functions/GetAdoption/src/handler");
    const response = await handleRequest(
      makeEvent({ resource: "/adoption/{id}", pathParameters: { id: "bad-id" } }),
      makeContext()
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("adoption.invalidPetIdFormat");
    expect(routeRequest).not.toHaveBeenCalled();
  });
});

// ─── Service layer ────────────────────────────────────────────────────────────

describe("GetAdoption services", () => {
  const {
    buildAdoptionListQuery,
    getAdoptionList,
    getAdoptionById,
    LIST_PROJECTION,
    DETAIL_PROJECTION,
  } = require("../functions/GetAdoption/src/services/adoption");

  afterEach(() => { jest.restoreAllMocks(); });

  test("buildAdoptionListQuery always excludes base excluded sites", () => {
    const query = buildAdoptionListQuery({});
    expect(query.$and[0]).toEqual({
      AdoptionSite: { $nin: ["Arc Dog Shelter", "Tolobunny", "HKRABBIT"] },
    });
    expect(query.$and[1]).toEqual({ Image_URL: { $ne: [] } });
    expect(query.$or).toBeUndefined();
  });

  test("buildAdoptionListQuery escapes regex special chars in search term", () => {
    const query = buildAdoptionListQuery({ locations: ["HKI"], ages: ["青年"], search: "dog.*" });
    expect(query.$and).toEqual(
      expect.arrayContaining([
        { AdoptionSite: { $nin: ["Arc Dog Shelter", "Tolobunny", "HKRABBIT"] } },
        { Image_URL: { $ne: [] } },
        { AdoptionSite: { $in: ["HKI"] } },
        { $or: [{ Age: { $gte: 12, $lte: 36 } }] },
      ])
    );
    expect(query.$or).toEqual([
      { Breed: { $regex: "dog\\.\\*", $options: "i" } },
      { Animal_Type: { $regex: "dog\\.\\*", $options: "i" } },
      { Remark: { $regex: "dog\\.\\*", $options: "i" } },
    ]);
  });

  test("getAdoptionList returns sanitized success payload with correct shape", async () => {
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
        headers: {},
        locale: "en",
      },
      query: { page: 1, search: "milo", animalTypes: [], locations: [], sexes: [], ages: [] },
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
    expect(aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $project: LIST_PROJECTION }),
      ])
    );
  });

  test("getAdoptionList returns maxPage 0 when no results found", async () => {
    const countDocuments = jest.fn().mockResolvedValue(0);
    const aggregate = jest.fn().mockResolvedValue([]);
    jest.spyOn(mongoose, "model").mockReturnValue({ countDocuments, aggregate });

    const response = await getAdoptionList({
      event: { httpMethod: "GET", resource: "/adoption", queryStringParameters: {}, headers: {}, locale: "en" },
      query: { page: 1, search: "", animalTypes: [], locations: [], sexes: [], ages: [] },
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.adoptionList).toEqual([]);
    expect(body.totalResult).toBe(0);
    expect(body.maxPage).toBe(0);
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

  test("getAdoptionById returns detail payload including adoption-website required fields", async () => {
    const petDoc = {
      _id: "507f1f77bcf86cd799439011",
      Name: "Luna",
      Age: 24,
      Sex: "F",
      Breed: "Mix",
      Image_URL: ["https://example.com/luna.jpg"],
      Remark: "gentle",
      AdoptionSite: "HKI",
      URL: "https://adopt.org/luna",
    };
    const lean = jest.fn().mockResolvedValue(petDoc);
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

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    // adoption_website depends on these fields (service returns body.pet, not body.form)
    expect(body.pet.Remark).toBe("gentle");
    expect(body.pet.AdoptionSite).toBe("HKI");
    expect(body.pet.URL).toBe("https://adopt.org/luna");
    expect(body.pet.Image_URL).toEqual(["https://example.com/luna.jpg"]);
    expect(select).toHaveBeenCalledWith(DETAIL_PROJECTION);
  });
});
