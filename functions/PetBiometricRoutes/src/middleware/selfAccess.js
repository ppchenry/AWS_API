const mongoose = require("mongoose");

const { createErrorResponse } = require("../utils/response");

const OWNER_SCOPED_ROUTES = new Set([
  "GET /petBiometrics/{petId}",
  "POST /petBiometrics/register",
  "POST /petBiometrics/verifyPet",
]);

/**
 * Loads a pet record and verifies the caller is allowed to access it.
 * Access is granted to the pet owner, a matching NGO, or an admin caller.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any>, petId: string }} request
 * @returns {Promise<{ isValid: boolean, error?: import("aws-lambda").APIGatewayProxyResult, pet?: Record<string, any> }>}
 */
async function loadAuthorizedPet({ event, petId }) {
  const routeKey = `${event.httpMethod} ${event.resource}`;
  if (!OWNER_SCOPED_ROUTES.has(routeKey)) {
    return { isValid: true };
  }

  const Pet = mongoose.model("Pet");
  const pet = await Pet.findOne({
    _id: petId,
    deleted: { $ne: true },
  })
    .select("_id userId ngoId isRegistered")
    .lean();

  if (!pet) {
    return {
      isValid: false,
      error: createErrorResponse(404, "petBiometricRoutes.errors.petNotFound", event),
    };
  }

  const callerUserId = event.userId ? String(event.userId) : "";
  const ownerUserId = pet.userId ? String(pet.userId) : "";
  const callerNgoId = event.ngoId ? String(event.ngoId) : "";
  const petNgoId = pet.ngoId ? String(pet.ngoId) : "";

  const isAdmin = event.userRole === "admin";
  const isOwner = callerUserId && ownerUserId && callerUserId === ownerUserId;
  const isNgoMatch = callerNgoId && petNgoId && callerNgoId === petNgoId;

  if (!isAdmin && !isOwner && !isNgoMatch) {
    return {
      isValid: false,
      error: createErrorResponse(403, "petBiometricRoutes.errors.forbidden", event),
    };
  }

  return {
    isValid: true,
    pet,
  };
}

module.exports = { loadAuthorizedPet };