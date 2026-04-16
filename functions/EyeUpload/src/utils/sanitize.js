function sanitizeUser(user) {
  if (!user) return user;
  const rawUser = typeof user.toObject === "function" ? user.toObject() : user;
  const {
    password,
    credit,
    vetCredit,
    eyeAnalysisCredit,
    bloodAnalysisCredit,
    ...safeUser
  } = rawUser;
  return safeUser;
}

function sanitizePet(pet) {
  if (!pet) return pet;
  const rawPet = typeof pet.toObject === "function" ? pet.toObject() : pet;
  const { deleted, ...safePet } = rawPet;
  return safePet;
}

module.exports = { sanitizeUser, sanitizePet };
