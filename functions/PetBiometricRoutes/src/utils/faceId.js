const env = require("../config/env");

const { logError, logWarn } = require("./logger");

/**
 * Calls the external FaceID API to compare stored pet images with an inference image.
 *
 * @param {{ sourceUrls: string[], inferenceUrl: string, species?: string, event?: import("aws-lambda").APIGatewayProxyEvent | Record<string, any> }} request
 * @returns {Promise<{ ok: true, data: any } | { ok: false, statusCode?: number, data?: any, error?: Error }>}
 */
async function verifyPetFace({ sourceUrls, inferenceUrl, species, event }) {
  try {
    const response = await fetch(env.FACEID_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        face_original_urls: sourceUrls,
        face_inference_urls: [inferenceUrl],
        threshold: 0.6,
        species,
      }),
    });

    const bodyText = await response.text();
    let parsedBody = {};
    if (bodyText) {
      try {
        parsedBody = JSON.parse(bodyText);
      } catch (error) {
        parsedBody = { raw: bodyText };
      }
    }

    if (!response.ok) {
      logWarn("FaceID API returned non-success response", {
        scope: "utils.faceId.verifyPetFace",
        event,
        extra: {
          statusCode: response.status,
          response: parsedBody,
        },
      });

      return {
        ok: false,
        statusCode: response.status,
        data: parsedBody,
      };
    }

    return {
      ok: true,
      data: parsedBody,
    };
  } catch (error) {
    logError("FaceID API request failed", {
      scope: "utils.faceId.verifyPetFace",
      event,
      error,
      extra: {
        endpoint: env.FACEID_API,
      },
    });

    return {
      ok: false,
      error,
    };
  }
}

module.exports = { verifyPetFace };