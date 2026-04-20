# PetMedicalRecord API

All non-OPTIONS routes require `Authorization: Bearer <token>`.
All pet-scoped routes perform DB-backed ownership at service start after DB bootstrap. The caller must either own the pet via JWT `userId` or match the pet's `ngoId`.

## Routes

### Medical Records

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/pets/{petID}/medical-record` | JWT | List medical records for an authorized pet |
| POST | `/pets/{petID}/medical-record` | JWT | Create a medical record |
| PUT | `/pets/{petID}/medical-record/{medicalID}` | JWT | Update a medical record |
| DELETE | `/pets/{petID}/medical-record/{medicalID}` | JWT | Delete a medical record |

POST/PUT body:
```json
{
  "medicalDate": "2024-01-15",
  "medicalPlace": "Vet Clinic A",
  "medicalDoctor": "Dr. Smith",
  "medicalResult": "Healthy",
  "medicalSolution": "None required"
}
```

GET success shape:
```json
{
  "success": true,
  "message": "medicalRecord.getSuccess",
  "form": {
    "medical": [
      {
        "_id": "record-id",
        "medicalDate": "2024-01-15T00:00:00.000Z",
        "medicalPlace": "Vet Clinic A",
        "medicalDoctor": "Dr. Smith",
        "medicalResult": "Healthy",
        "medicalSolution": "None required",
        "petId": "pet-id"
      }
    ]
  },
  "petId": "pet-id"
}
```

POST/PUT success shape:
```json
{
  "success": true,
  "message": "medicalRecord.postSuccess",
  "form": {
    "_id": "record-id",
    "medicalDate": "2024-01-15T00:00:00.000Z",
    "medicalPlace": "Vet Clinic A",
    "medicalDoctor": "Dr. Smith",
    "medicalResult": "Healthy",
    "medicalSolution": "None required",
    "petId": "pet-id"
  },
  "petId": "pet-id",
  "medicalRecordId": "record-id"
}
```

DELETE success shape:
```json
{
  "success": true,
  "message": "medicalRecord.deleteSuccess",
  "id": "pet-id"
}
```

### Medication Records

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/pets/{petID}/medication-record` | JWT | List medication records for an authorized pet |
| POST | `/pets/{petID}/medication-record` | JWT | Create a medication record |
| PUT | `/pets/{petID}/medication-record/{medicationID}` | JWT | Update a medication record |
| DELETE | `/pets/{petID}/medication-record/{medicationID}` | JWT | Delete a medication record |

POST/PUT body:
```json
{
  "medicationDate": "2024-01-15",
  "drugName": "Amoxicillin",
  "drugPurpose": "Infection treatment",
  "drugMethod": "Oral",
  "drugRemark": "Twice daily",
  "allergy": false
}
```

GET success form key: `form.medication`
POST/PUT success id field: `medicationRecordId`
DELETE success field: `id`

### Deworm Records

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/pets/{petID}/deworm-record` | JWT | List deworm records for an authorized pet |
| POST | `/pets/{petID}/deworm-record` | JWT | Create a deworm record |
| PUT | `/pets/{petID}/deworm-record/{dewormID}` | JWT | Update a deworm record |
| DELETE | `/pets/{petID}/deworm-record/{dewormID}` | JWT | Delete a deworm record |

POST/PUT body:
```json
{
  "date": "2024-01-15",
  "vaccineBrand": "Frontline",
  "vaccineType": "Spot-on",
  "typesOfInternalParasites": ["roundworm"],
  "typesOfExternalParasites": ["flea"],
  "frequency": 3,
  "nextDewormDate": "2024-04-15",
  "notification": true
}
```

GET success form key: `form.deworm`
POST/PUT success id field: `dewormRecordId`
DELETE success field: `id`

### Blood Test Records

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/pets/{petID}/blood-test-record` | JWT | List blood-test records for an authorized pet |
| POST | `/pets/{petID}/blood-test-record` | JWT | Create a blood-test record |
| PUT | `/pets/{petID}/blood-test-record/{bloodTestID}` | JWT | Update a blood-test record |
| DELETE | `/pets/{petID}/blood-test-record/{bloodTestID}` | JWT | Delete a blood-test record |

POST/PUT body:
```json
{
  "bloodTestDate": "2024-01-15",
  "heartworm": "negative",
  "lymeDisease": "negative",
  "ehrlichiosis": "negative",
  "anaplasmosis": "negative",
  "babesiosis": "negative"
}
```

GET success form key: `form.blood_test`
POST/PUT success id field: `bloodTestRecordId`
DELETE success fields: `petId`, `bloodTestRecordId`

## Error Shape

All structured errors use:
```json
{
  "success": false,
  "errorKey": "others.invalidJSON",
  "error": "Invalid JSON format",
  "requestId": "aws-request-id"
}
```

Common route-specific error keys include:
- `missingPetId`
- `invalidPetIdFormat`
- `petNotFound`
- `others.forbidden`
- `others.invalidJSON`
- `others.missingParams`
- `medicalRecord.medicalRecordNotFound`
- `medicationRecord.medicationRecordNotFound`
- `dewormRecord.dewormRecordNotFound`
- `bloodTest.bloodTestRecordNotFound`
- `medicalRecord.noFieldsToUpdate`
- `medicationRecord.noFieldsToUpdate`
- `dewormRecord.noFieldsToUpdate`
- `bloodTest.noFieldsToUpdate`

## Constraints

- All path parameters (`petID`, record IDs) must be valid MongoDB ObjectIds.
- POST and PUT requests require a non-empty JSON body.
- Unknown request-body keys are rejected by strict schemas.
- POST/PUT return `400 ...noFieldsToUpdate` when no valid domain fields remain.
- Update and delete operations are scoped by both record id and `petId`.
- Missing, deleted, or unauthorized pets fail before service execution.
- Date inputs accept ISO `YYYY-MM-DD`, ISO timestamps, and `DD/MM/YYYY`; impossible calendar dates are rejected.
- Delete routes intentionally preserve current hard-delete behavior because these record collections do not expose a `deleted` field.
- Pet summary maintenance is uniform across medical, medication, deworm, and blood-test records, including `bloodTestRecordsCount` and `latestBloodTestDate`.
