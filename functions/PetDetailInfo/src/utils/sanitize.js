function sanitizePetDetail(pet) {
  if (!pet) return pet;
  const raw = typeof pet.toObject === "function" ? pet.toObject() : pet;
  const {
    password,
    __v,
    ...safePet
  } = raw;
  return safePet;
}

function sanitizeSource(source) {
  if (!source) return source;
  const raw = typeof source.toObject === "function" ? source.toObject() : source;
  const { __v, ...safe } = raw;
  return safe;
}

function sanitizeAdoption(adoption) {
  if (!adoption) return adoption;
  const raw = typeof adoption.toObject === "function" ? adoption.toObject() : adoption;
  const { __v, ...safe } = raw;
  return safe;
}

module.exports = { sanitizePetDetail, sanitizeSource, sanitizeAdoption };
