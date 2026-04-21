function sanitizePet(pet) {
  if (!pet) {
    return pet;
  }

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
    breed: raw.breed,
    features: raw.features,
    info: raw.info,
    status: raw.status,
    owner: raw.owner,
    ngoId: raw.ngoId,
    ownerContact1: raw.contact1Show ? raw.ownerContact1 : undefined,
    ownerContact2: raw.contact2Show ? raw.ownerContact2 : undefined,
    contact1Show: raw.contact1Show,
    contact2Show: raw.contact2Show,
    tagId: raw.tagId,
    isRegistered: raw.isRegistered,
    receivedDate: raw.receivedDate,
    ngoPetId: raw.ngoPetId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

module.exports = { sanitizePet };