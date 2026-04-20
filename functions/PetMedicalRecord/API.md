# PetMedicalRecord API

All routes require JWT authentication via `Authorization: Bearer <token>` header.

## Routes

### Medical Records

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pets/{petID}/medical-record` | List all medical records for a pet |
| POST | `/pets/{petID}/medical-record` | Create a medical record |
| PUT | `/pets/{petID}/medical-record/{medicalID}` | Update a medical record |
| DELETE | `/pets/{petID}/medical-record/{medicalID}` | Delete a medical record |

**POST/PUT Body:**
```json
{
  "medicalDate": "2024-01-15",
  "medicalPlace": "Vet Clinic A",
  "medicalDoctor": "Dr. Smith",
  "medicalResult": "Healthy",
  "medicalSolution": "None required"
}
```

### Medication Records

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pets/{petID}/medication-record` | List all medication records for a pet |
| POST | `/pets/{petID}/medication-record` | Create a medication record |
| PUT | `/pets/{petID}/medication-record/{medicationID}` | Update a medication record |
| DELETE | `/pets/{petID}/medication-record/{medicationID}` | Delete a medication record |

**POST/PUT Body:**
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

### Deworm Records

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pets/{petID}/deworm-record` | List all deworm records for a pet |
| POST | `/pets/{petID}/deworm-record` | Create a deworm record |
| PUT | `/pets/{petID}/deworm-record/{dewormID}` | Update a deworm record |
| DELETE | `/pets/{petID}/deworm-record/{dewormID}` | Delete a deworm record |

**POST/PUT Body:**
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

### Blood Test Records

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pets/{petID}/blood-test-record` | List all blood test records for a pet |
| POST | `/pets/{petID}/blood-test-record` | Create a blood test record |
| PUT | `/pets/{petID}/blood-test-record/{bloodTestID}` | Update a blood test record |
| DELETE | `/pets/{petID}/blood-test-record/{bloodTestID}` | Delete a blood test record |

**POST/PUT Body:**
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

## Response Shape

**Success:**
```json
{
  "success": true,
  "message": "medicalRecord.getSuccess",
  "form": { ... },
  "petId": "..."
}
```

**Error:**
```json
{
  "success": false,
  "errorKey": "medicalRecord.invalidDateFormat",
  "error": "Invalid date format...",
  "requestId": "..."
}
```

## Date Formats

Accepted: ISO 8601 (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ssZ`) and `DD/MM/YYYY`.

## Constraints

- All path parameters (`petID`, `medicalID`, etc.) must be valid MongoDB ObjectIds.
- POST/PUT requests require a non-empty JSON body.
- Blood test PUT returns 400 if no updatable fields are provided.
