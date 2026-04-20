const {
  syncBloodTestPetSummary,
} = require("../functions/PetMedicalRecord/src/services/bloodTest");

describe("PetMedicalRecord blood-test aggregate maintenance", () => {
  test("create increments count and updates latest blood-test date", async () => {
    const BloodTest = {
      countDocuments: jest.fn(),
      find: jest.fn(),
    };
    const Pet = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      findByIdAndUpdate: jest.fn(),
    };
    const parsedBloodTestDate = new Date("2030-01-15T00:00:00.000Z");

    await syncBloodTestPetSummary({
      petId: "6871cb702211cfb6c4f357fa",
      parsedBloodTestDate,
      mode: "create",
      models: { BloodTest, Pet },
    });

    expect(Pet.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "6871cb702211cfb6c4f357fa", deleted: { $ne: true } },
      {
        $inc: { bloodTestRecordsCount: 1 },
        $max: { latestBloodTestDate: parsedBloodTestDate },
      }
    );
    expect(BloodTest.countDocuments).not.toHaveBeenCalled();
  });

  test("update recalculates count and latest blood-test date", async () => {
    const BloodTest = {
      countDocuments: jest.fn().mockResolvedValue(4),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { bloodTestDate: new Date("2031-01-16T00:00:00.000Z") },
              ]),
            }),
          }),
        }),
      }),
    };
    const Pet = {
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };

    await syncBloodTestPetSummary({
      petId: "6871cb702211cfb6c4f357fa",
      mode: "recalculate",
      models: { BloodTest, Pet },
    });

    expect(BloodTest.countDocuments).toHaveBeenCalledWith({
      petId: "6871cb702211cfb6c4f357fa",
    });
    expect(Pet.findByIdAndUpdate).toHaveBeenCalledWith(
      "6871cb702211cfb6c4f357fa",
      {
        bloodTestRecordsCount: 4,
        latestBloodTestDate: new Date("2031-01-16T00:00:00.000Z"),
      }
    );
  });

  test("delete recalculates count and clears latest blood-test date when empty", async () => {
    const BloodTest = {
      countDocuments: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };
    const Pet = {
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };

    await syncBloodTestPetSummary({
      petId: "6871cb702211cfb6c4f357fa",
      mode: "recalculate",
      models: { BloodTest, Pet },
    });

    expect(Pet.findByIdAndUpdate).toHaveBeenCalledWith(
      "6871cb702211cfb6c4f357fa",
      {
        bloodTestRecordsCount: 0,
        latestBloodTestDate: null,
      }
    );
  });
});
