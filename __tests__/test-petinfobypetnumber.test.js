jest.mock("../functions/PetInfoByPetNumber/src/config/db", () => ({
  getReadConnection: jest.fn(),
}));

function buildEvent(overrides = {}) {
  return {
    httpMethod: "GET",
    resource: "/pets/getPetInfobyTagId/{tagId}",
    pathParameters: { tagId: "TAG-001" },
    headers: {
      origin: "http://localhost:3000",
    },
    requestContext: {
      requestId: "req-1",
    },
    ...overrides,
  };
}

function loadSubject() {
  const { getReadConnection } = require("../functions/PetInfoByPetNumber/src/config/db");
  const { handler } = require("../functions/PetInfoByPetNumber");

  return {
    getReadConnection,
    handler,
  };
}

describe("PetInfoByPetNumber", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    process.env.NODE_ENV = "test";
    process.env.MONGODB_URI = "mongodb://example.test/db";
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_BYPASS = "false";
    process.env.ALLOWED_ORIGINS = "http://localhost:3000";
  });

  test("returns 204 for allowed OPTIONS preflight", async () => {
    const { handler, getReadConnection } = loadSubject();

    const response = await handler(buildEvent({ httpMethod: "OPTIONS" }), {
      awsRequestId: "aws-1",
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(getReadConnection).not.toHaveBeenCalled();
  });

  test("returns 403 for disallowed OPTIONS preflight", async () => {
    const { handler } = loadSubject();

    const response = await handler(buildEvent({
      httpMethod: "OPTIONS",
      headers: { origin: "http://evil.test" },
    }), {
      awsRequestId: "aws-2",
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).errorKey).toBe("others.originNotAllowed");
  });

  test("returns 400 when tagId is missing", async () => {
    const { handler, getReadConnection } = loadSubject();

    const response = await handler(buildEvent({ pathParameters: {} }), {
      awsRequestId: "aws-3",
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errorKey).toBe("petInfoByPetNumber.errors.tagIdRequired");
    expect(getReadConnection).not.toHaveBeenCalled();
  });

  test("returns 405 for unsupported methods", async () => {
    const { handler, getReadConnection } = loadSubject();

    const response = await handler(buildEvent({ httpMethod: "DELETE" }), {
      awsRequestId: "aws-4",
    });

    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).errorKey).toBe("others.methodNotAllowed");
    expect(getReadConnection).not.toHaveBeenCalled();
  });

  test("returns 404 when pet is not found", async () => {
    const { handler, getReadConnection } = loadSubject();
    const findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    getReadConnection.mockResolvedValue({
      model: jest.fn().mockReturnValue({ findOne }),
    });

    const response = await handler(buildEvent(), {
      awsRequestId: "aws-5",
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).errorKey).toBe("petInfoByPetNumber.errors.notFound");
    expect(findOne).toHaveBeenCalledWith({
      tagId: "TAG-001",
      deleted: { $ne: true },
    });
  });

  test("returns sanitized pet info and hides contacts flagged off", async () => {
    const { handler, getReadConnection } = loadSubject();
    const pet = {
      _id: "pet-1",
      userId: "user-1",
      name: "Milo",
      breedimage: ["https://cdn.example/pet.jpg"],
      animal: "cat",
      birthday: "2022-01-01T00:00:00.000Z",
      weight: 5,
      sex: "male",
      sterilization: true,
      breed: "British Shorthair",
      features: "white paws",
      info: "friendly",
      status: "active",
      owner: "Jimmy",
      ngoId: "ngo-1",
      ownerContact1: 12345678,
      ownerContact2: 87654321,
      contact1Show: false,
      contact2Show: true,
      tagId: "TAG-001",
      isRegistered: true,
      receivedDate: "2022-02-01T00:00:00.000Z",
      ngoPetId: "NGO-22",
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-02-01T00:00:00.000Z",
      deleted: false,
      __v: 3,
    };

    const findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(pet) });
    getReadConnection.mockResolvedValue({
      model: jest.fn().mockReturnValue({ findOne }),
    });

    const response = await handler(buildEvent(), {
      awsRequestId: "aws-6",
    });

    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBe("pet-1");
    expect(body.form.name).toBe("Milo");
    expect(body.form).not.toHaveProperty("ownerContact1");
    expect(body.form.ownerContact2).toBe(87654321);
    expect(body.form.contact1Show).toBe(false);
    expect(body.form.contact2Show).toBe(true);
  });
});