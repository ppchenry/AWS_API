function sanitizeVaccineRecord(record) {
  if (!record) return record;

  return {
    vaccineDate: record.vaccineDate ?? null,
    vaccineName: record.vaccineName ?? null,
    vaccineNumber: record.vaccineNumber ?? null,
    vaccineTimes: record.vaccineTimes ?? null,
    vaccinePosition: record.vaccinePosition ?? null,
    _id: record._id,
  };
}

module.exports = {
  sanitizeVaccineRecord,
};