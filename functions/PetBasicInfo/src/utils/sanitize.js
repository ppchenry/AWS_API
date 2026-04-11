/**
 * @fileoverview Response sanitizers for pet-shaped data.
 * Strips internal fields (deleted, __v) and returns only the API-safe allowlist.
 */

/**
 * Removes internal fields from a pet record before it is returned in an API response.
 * Uses an explicit allowlist so new schema fields are never accidentally leaked.
 *
 * @param {Record<string, any> | { toObject: () => Record<string, any> } | null | undefined} pet
 * @returns {Record<string, any> | null | undefined}
 */
function sanitizePet(pet) {
  if (!pet) return pet;
  const raw = typeof pet.toObject === "function" ? pet.toObject() : pet;
  return {
    userId: raw.userId,
    name: raw.name,
    breedimage: raw.breedimage,
    animal: raw.animal,
    birthday: raw.birthday,
    weight: raw.weight,
    sex: raw.sex,
    sterilization: raw.sterilization,
    sterilizationDate: raw.sterilizationDate,
    adoptionStatus: raw.adoptionStatus,
    breed: raw.breed,
    bloodType: raw.bloodType,
    features: raw.features,
    info: raw.info,
    status: raw.status,
    owner: raw.owner,
    ngoId: raw.ngoId,
    ownerContact1: raw.ownerContact1,
    ownerContact2: raw.ownerContact2,
    contact1Show: raw.contact1Show,
    contact2Show: raw.contact2Show,
    tagId: raw.tagId,
    isRegistered: raw.isRegistered,
    receivedDate: raw.receivedDate,
    ngoPetId: raw.ngoPetId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    location: raw.locationName,
    position: raw.position,
  };
}

/**
 * Removes internal fields from an eye analysis record before it is returned in an API response.
 * Exposes only the fields a client legitimately needs; the raw `result` object is omitted
 * because it can contain untyped internal model output or confidence metadata.
 *
 * @param {Record<string, any> | null | undefined} record
 * @returns {Record<string, any> | null | undefined}
 */
function sanitizeEyeLog(record) {
  if (!record) return record;
  const raw = typeof record.toObject === "function" ? record.toObject() : record;
  return {
    _id: raw._id,
    petId: raw.petId,
    image: raw.image,
    eyeSide: raw.eyeSide,
    result: raw.result,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

module.exports = { sanitizePet, sanitizeEyeLog };
