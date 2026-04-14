/**
 * Removes sensitive/internal fields from a pet record before API response.
 */
function sanitizePet(pet) {
  if (!pet) return pet;

  const rawPet = typeof pet.toObject === "function" ? pet.toObject() : { ...pet };

  // Remove internal fields that should not be exposed to clients
  delete rawPet.__v;
  delete rawPet.deleted;

  return rawPet;
}

/**
 * Sanitizes an array of pet records.
 */
function sanitizePets(pets) {
  if (!Array.isArray(pets)) return pets;
  return pets.map(sanitizePet);
}

module.exports = { sanitizePet, sanitizePets };
