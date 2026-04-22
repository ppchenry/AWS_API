function sanitizeAdoption(adoption) {
  if (!adoption) {
    return adoption;
  }

  const rawAdoption = typeof adoption.toObject === "function" ? adoption.toObject() : adoption;
  const { __v, parsedDate, ...safeAdoption } = rawAdoption;
  return safeAdoption;
}

module.exports = { sanitizeAdoption };