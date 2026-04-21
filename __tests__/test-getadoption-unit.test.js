const mongoose = require("../functions/GetAdoption/node_modules/mongoose");

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

describe("GetAdoption services", () => {
  const { buildAdoptionListQuery, getAdoptionList, getAdoptionById } = require("../functions/GetAdoption/src/services/adoption");

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
        Image_URL: ["https://example.com/milo.jpg"],
        parsedDate: new Date(),
        __v: 7,
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
        Image_URL: ["https://example.com/milo.jpg"],
      },
    ]);
    expect(body.totalResult).toBe(1);
    expect(body.maxPage).toBe(1);
    expect(countDocuments).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  test("getAdoptionById returns 404 when pet is missing", async () => {
    const lean = jest.fn().mockResolvedValue(null);
    const findOne = jest.fn().mockReturnValue({ lean });
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
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      errorKey: "adoption.petNotFound",
    });
  });
});