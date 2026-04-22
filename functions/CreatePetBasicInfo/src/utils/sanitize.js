const PUBLIC_PET_FIELDS = [
  "_id",
  "name",
  "birthday",
  "weight",
  "sex",
  "sterilization",
  "animal",
  "breed",
  "features",
  "info",
  "status",
  "breedimage",
  "tagId",
  "receivedDate",
];

function sanitizePet(pet) {
  if (!pet) {
    return pet;
  }

  const rawPet = typeof pet.toObject === "function" ? pet.toObject() : pet;

  return PUBLIC_PET_FIELDS.reduce((safePet, field) => {
    if (rawPet[field] !== undefined) {
      safePet[field] = rawPet[field];
    }

    return safePet;
  }, {});
}

module.exports = { sanitizePet };
