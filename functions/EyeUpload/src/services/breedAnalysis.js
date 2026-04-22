const {
  createErrorResponse,
  createSuccessResponse,
} = require("../utils/response");
const { logError } = require("../utils/logger");
const { enforceRateLimit } = require("../utils/rateLimit");
const env = require("../config/env");
const { breedAnalysisSchema } = require("../zodSchema/breedAnalysisSchema");
const { getFirstZodIssueMessage } = require("../utils/zod");

/**
 * POST /analysis/breed
 * Forward species + image URL to external breed analysis ML endpoint.
 */
async function breedAnalysis({ event, body }) {
  const scope = "services.breedAnalysis.breedAnalysis";
  try {
    // Rate limit: 20 breed analyses per 5 minutes per caller
    const rl = await enforceRateLimit({
      event,
      action: "breedAnalysis",
      identifier: event.userId,
      limit: 20,
      windowSec: 300,
    });
    if (!rl.allowed) {
      return createErrorResponse(429, "common.rateLimited", event);
    }

    // Zod validation — rejects unknown fields, enforces type/format
    const parseResult = breedAnalysisSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(
        400,
        getFirstZodIssueMessage(parseResult.error),
        event
      );
    }
    const { species, url } = parseResult.data;

    const endpoint =
      env.VM_BREED_PUBLIC_IP + env.BREED_DOCKER_IMAGE;

    const params = new URLSearchParams();
    params.append("species", species);
    params.append("url", url);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const jsonResponse = await response.json();

    return createSuccessResponse(200, event, {
      message: "Successfully analyze breed",
      result: jsonResponse,
    });
  } catch (error) {
    logError("Breed analysis failed", { scope, event, error });
    return createErrorResponse(500, "common.internalError", event);
  }
}

module.exports = { breedAnalysis };
