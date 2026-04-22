const PUBLIC_PET_FIELDS = [
  "name",
  "breedimage",
  "animal",
  "birthday",
  "weight",
  "sex",
  "sterilization",
  "breed",
  "features",
  "info",
  "status",
  "receivedDate",
];

function sanitizePet(pet) {
  const raw = typeof pet.toObject === "function" ? pet.toObject() : pet;
  return PUBLIC_PET_FIELDS.reduce((safePet, field) => {
    safePet[field] = raw?.[field] ?? null;
    return safePet;
  }, {});
}

module.exports = { sanitizePet };
