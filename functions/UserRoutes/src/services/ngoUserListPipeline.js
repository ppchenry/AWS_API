const NGO_USER_LIST_PROJECTION = {
  userId: 1,
  ngoId: 1,
  createdAt: 1,
  "user.firstName": 1,
  "user.lastName": 1,
  "user.email": 1,
  "user.role": 1,
  "ngo.name": 1,
};

function buildNgoUserLookupStage() {
  return {
    $lookup: {
      from: "users",
      let: { userId: "$userId" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$_id", "$$userId"] },
            deleted: false,
          },
        },
        {
          $project: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            role: 1,
          },
        },
      ],
      as: "user",
    },
  };
}

function buildNgoLookupStage() {
  return {
    $lookup: {
      from: "ngos",
      let: { ngoId: "$ngoId" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$_id", "$$ngoId"] },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            registrationNumber: 1,
          },
        },
      ],
      as: "ngo",
    },
  };
}

function buildNgoCounterLookupStage() {
  return {
    $lookup: {
      from: "ngo_counters",
      let: { ngoId: "$ngoId" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$ngoId", "$$ngoId"] },
          },
        },
        {
          $project: {
            _id: 0,
            ngoPrefix: 1,
            seq: 1,
          },
        },
      ],
      as: "ngoCounter",
    },
  };
}

function buildNgoUserListSearchStage(search) {
  if (!search) return null;

  return {
    $match: {
      $or: [
        { "user.firstName": { $regex: search, $options: "i" } },
        { "user.lastName": { $regex: search, $options: "i" } },
        { "ngo.name": { $regex: search, $options: "i" } },
        { "ngo.registrationNumber": { $regex: search, $options: "i" } },
      ],
    },
  };
}

function buildNgoUserListPipeline({ search, skip, limit }) {
  const pipeline = [
    { $match: { isActive: true } },
    buildNgoUserLookupStage(),
    { $unwind: "$user" },
    buildNgoLookupStage(),
    { $unwind: "$ngo" },
  ];

  const searchStage = buildNgoUserListSearchStage(search);
  if (searchStage) {
    pipeline.push(searchStage);
  }

  pipeline.push(
    { $project: NGO_USER_LIST_PROJECTION },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: skip },
          { $limit: limit },
          buildNgoCounterLookupStage(),
          { $unwind: { path: "$ngoCounter", preserveNullAndEmptyArrays: true } },
        ],
      },
    }
  );

  return pipeline;
}

module.exports = {
  buildNgoUserListPipeline,
};