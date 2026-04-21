function sanitizePet(pet) {
  if (!pet) {
    return pet;
  }

  const rawPet = typeof pet.toObject === "function" ? pet.toObject() : pet;
  const { deleted, __v, ...safePet } = rawPet;
  return safePet;
}

module.exports = { sanitizePet };