const mongoose = require("mongoose");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { logError } = require("../utils/logger");

async function getAnimalList({ event }) {
  const Animal = mongoose.model("Animal");
  const lang = event.pathParameters?.lang;

  const animalList = await Animal.find({}).lean();
  const result = animalList?.[0]?.animals?.[lang];

  if (!result) {
    return createErrorResponse(404, "getBreed.errors.animalListNotFound", event);
  }

  return createSuccessResponse(200, event, { result });
}

async function getProductList({ event }) {
  const ProductList = mongoose.model("ProductList");
  const result = await ProductList.find({}).lean();

  return createSuccessResponse(200, event, {
    result,
    message: "Retrieve product list successfully!",
  });
}

async function getDewormList({ event }) {
  const Anthelmintic = mongoose.model("Anthelmintic");
  const result = await Anthelmintic.find({}).lean();

  return createSuccessResponse(200, event, {
    result,
    message: "Deworm list has successfully been retrieved",
  });
}

async function getEyeDisease({ event }) {
  const EyeDiseaseList = mongoose.model("EyeDiseaseList");
  const rawName = event.pathParameters?.eyeDiseaseName;
  const eyeDiseaseName = rawName.includes("%20") ? decodeURIComponent(rawName) : rawName;

  const eyeDiseaseDetails = await EyeDiseaseList.findOne({
    eyeDisease_eng: eyeDiseaseName,
  }).lean();

  let result;
  if (!eyeDiseaseDetails && eyeDiseaseName === "Normal") {
    result = {
      id: null,
      eyeDiseaseEng: null,
      eyeDiseaseChi: null,
      eyeDiseaseCause: null,
      eyeDiseaseSolution: null,
    };
  } else if (eyeDiseaseDetails) {
    result = eyeDiseaseDetails;
  } else {
    return createErrorResponse(404, "getBreed.errors.eyeDiseaseNotFound", event);
  }

  return createSuccessResponse(201, event, {
    result,
    message: "Retrieve eye disease detail successfully",
  });
}

async function createProductLog({ event, body }) {
  try {
    const ProductLog = mongoose.model("ProductLog");
    const accessAt = body.accessAt ? new Date(body.accessAt) : null;

    const productLog = await ProductLog.create({
      petId: body.petId,
      userId: body.userId,
      userEmail: body.userEmail,
      productUrl: body.productUrl,
      accessAt,
    });

    return createSuccessResponse(201, event, {
      message: "Successfully create product log",
      result: productLog,
    });
  } catch (error) {
    logError("Error creating product log", {
      scope: "services.referenceData.createProductLog",
      event,
      error,
    });

    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = {
  getAnimalList,
  getProductList,
  getDewormList,
  getEyeDisease,
  createProductLog,
};
