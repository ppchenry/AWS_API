# Pet Health API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Clinical records for a pet: medical visits, medications, deworming, vaccines, and blood tests. All endpoints require Bearer JWT and pet ownership (owner `userId` match OR NGO `ngoId` match; privileged `admin` / `developer` bypass).

> Conventions: [README.md](./README.md).

## Shared Behavior

All resource endpoints share:

- **Auth**: Bearer JWT
- **Pet ownership guard** → 403 `common.forbidden` on mismatch; 404 `<lambdaDomain>.errors.petNotFound` when pet is soft-deleted / missing (where `<lambdaDomain>` is `petMedicalRecord` or `petVaccineRecords` depending on the route)
- **Date format**: all user-supplied date strings are **`DD/MM/YYYY`**, stored as ISO Date
- **Content-Type**: `application/json` (POST / PUT)
- **Soft delete (vaccine only)** — see below

### Common Errors (all endpoints)

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` | Malformed JSON body |
| 400 | `common.missingParams` | Empty body on POST / PUT |
| 400 | `<lambdaDomain>.errors.missingPetId` / `<lambdaDomain>.errors.invalidPetIdFormat` | Path `petID` invalid (`petMedicalRecord` or `petVaccineRecords` prefix) |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.forbidden` | Caller not owner / NGO |
| 404 | `<lambdaDomain>.errors.petNotFound` | Pet missing or deleted |
| 500 | `common.internalError` | |

### Success Envelope

GET list / POST / PUT / DELETE all return:

```json
{
  "success": true,
  "message": "<namespace>.<action>Success",
  "form": { /* record object or array */ },
  "petId": "...",
  "<recordIdField>": "...",
  "requestId": "..."
}
```

The `<recordIdField>` is one of: `medicalRecordId`, `medicationRecordId`, `dewormRecordId`, `bloodTestRecordId`, `vaccineId`.

---

## Medical Records

Lambda: **PetMedicalRecord**. Base path: `/pets/{petID}/medical-record`.

| Method | Path |
| --- | --- |
| GET | `/pets/{petID}/medical-record` |
| POST | `/pets/{petID}/medical-record` |
| PUT | `/pets/{petID}/medical-record/{medicalID}` |
| DELETE | `/pets/{petID}/medical-record/{medicalID}` |

**Body (POST / PUT, all optional, strict):**

| Field | Type | Notes |
| --- | --- | --- |
| `medicalDate` | string | `DD/MM/YYYY` |
| `medicalPlace` | string | |
| `medicalDoctor` | string | |
| `medicalResult` | string | |
| `medicalSolution` | string | |

**Domain errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petMedicalRecord.errors.medicalRecord.invalidDateFormat` | |
| 400 | `petMedicalRecord.errors.medicalRecord.missingId` | PUT missing `medicalID` |
| 404 | `petMedicalRecord.errors.medicalRecord.notFound` | |

---

## Medication Records

Base path: `/pets/{petID}/medication-record`.

| Method | Path |
| --- | --- |
| GET | `/pets/{petID}/medication-record` |
| POST | `/pets/{petID}/medication-record` |
| PUT | `/pets/{petID}/medication-record/{medicationID}` |
| DELETE | `/pets/{petID}/medication-record/{medicationID}` |

**Body (POST / PUT, all optional):**

| Field | Type | Notes |
| --- | --- | --- |
| `medicationDate` | string | `DD/MM/YYYY` |
| `drugName` | string | |
| `drugPurpose` | string | |
| `drugMethod` | string | |
| `drugRemark` | string | |
| `allergy` | boolean | Defaults `false` |

**Pet sync**: POST increments `Pet.medicationRecordsCount`.

**Domain errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petMedicalRecord.errors.medicationRecord.invalidDateFormat` | |
| 404 | `petMedicalRecord.errors.medicationRecord.notFound` | |

---

## Deworm Records

Base path: `/pets/{petID}/deworm-record`.

| Method | Path |
| --- | --- |
| GET | `/pets/{petID}/deworm-record` |
| POST | `/pets/{petID}/deworm-record` |
| PUT | `/pets/{petID}/deworm-record/{dewormID}` |
| DELETE | `/pets/{petID}/deworm-record/{dewormID}` |

**Body (POST / PUT, all optional):**

| Field | Type | Notes |
| --- | --- | --- |
| `date` | string | `DD/MM/YYYY` |
| `vaccineBrand` | string | |
| `vaccineType` | string | |
| `typesOfInternalParasites` | string[] | |
| `typesOfExternalParasites` | string[] | |
| `frequency` | number | |
| `nextDewormDate` | string | `DD/MM/YYYY` |
| `notification` | boolean | Defaults `false` |

**Pet sync**: POST increments `dewormRecordsCount` and sets `latestDewormDate` to max; PUT / DELETE recalculate both from the remaining records.

**Domain errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petMedicalRecord.errors.dewormRecord.invalidDateFormat` | `date` or `nextDewormDate` |
| 404 | `petMedicalRecord.errors.dewormRecord.notFound` | |

---

## Blood Test Records (v2)

Base path: `/v2/pets/{petID}/blood-test-record`.

| Method | Path |
| --- | --- |
| GET | `/v2/pets/{petID}/blood-test-record` |
| POST | `/v2/pets/{petID}/blood-test-record` |
| PUT | `/v2/pets/{petID}/blood-test-record/{bloodTestID}` |
| DELETE | `/v2/pets/{petID}/blood-test-record/{bloodTestID}` |

**Body (POST / PUT, all optional):**

| Field | Type | Notes |
| --- | --- | --- |
| `bloodTestDate` | string | `DD/MM/YYYY` |
| `heartworm` | string | |
| `lymeDisease` | string | |
| `ehrlichiosis` | string | |
| `anaplasmosis` | string | |
| `babesiosis` | string | |

**Pet sync**:
- **POST**: increments `Pet.bloodTestRecordsCount`, updates `latestBloodTestDate` to max
- **PUT / DELETE**: **full recalculation** — queries all remaining blood-test dates to recompute `bloodTestRecordsCount` and `latestBloodTestDate`

**Domain errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petMedicalRecord.errors.bloodTest.invalidDateFormat` | |
| 404 | `petMedicalRecord.errors.bloodTest.notFound` | |

---

## Vaccine Records

Lambda: **PetVaccineRecords**. Base path: `/pets/{petID}/vaccine-record`.

| Method | Path |
| --- | --- |
| GET | `/pets/{petID}/vaccine-record` |
| POST | `/pets/{petID}/vaccine-record` |
| PUT | `/pets/{petID}/vaccine-record/{vaccineID}` |
| DELETE | `/pets/{petID}/vaccine-record/{vaccineID}` |

**Soft delete**: DELETE sets `isDeleted: true`, `deletedAt: now`. GET filters `isDeleted !== true`.

**Body (POST / PUT, all optional, nullable):**

| Field | Type | Notes |
| --- | --- | --- |
| `vaccineDate` | string \| null | `DD/MM/YYYY` |
| `vaccineName` | string \| null | Non-empty if provided (not `""`) |
| `vaccineNumber` | string \| null | |
| `vaccineTimes` | string \| null | |
| `vaccinePosition` | string \| null | |

**Pet sync**: POST / PUT / DELETE all recalculate `vaccineRecordsCount` and `latestVaccineDate` from non-deleted records.

**Domain errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petVaccineRecords.errors.vaccineRecord.invalidInput` | Empty-string field (e.g., `vaccineName: ""`) |
| 400 | `petVaccineRecords.errors.invalidDateFormat` | |
| 404 | `petVaccineRecords.errors.notFound` | |
