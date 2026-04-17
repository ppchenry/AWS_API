# PetDetailInfo API

All routes require JWT authentication via `Authorization: Bearer <token>` header.

## Routes

### Pet Detail Info

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pets/{petID}/detail-info` | Get pet detail info (chip, parents, transfer records) |
| POST | `/pets/{petID}/detail-info` | Update pet detail info (chip, parents, place of birth) |

**POST Request Body:**
```json
{
  "chipId": "string",
  "placeOfBirth": "string",
  "motherName": "string",
  "motherBreed": "string",
  "motherDOB": "YYYY-MM-DD or DD/MM/YYYY",
  "motherChip": "string",
  "motherPlaceOfBirth": "string",
  "motherParity": "number",
  "fatherName": "string",
  "fatherBreed": "string",
  "fatherDOB": "YYYY-MM-DD or DD/MM/YYYY",
  "fatherChip": "string",
  "fatherPlaceOfBirth": "string"
}
```

### Transfer Records

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pets/{petID}/detail-info/transfer` | Create a new transfer record |
| PUT | `/pets/{petID}/detail-info/transfer/{transferId}` | Update a transfer record |
| DELETE | `/pets/{petID}/detail-info/transfer/{transferId}` | Delete a transfer record |

**POST/PUT Request Body:**
```json
{
  "regDate": "YYYY-MM-DD or DD/MM/YYYY",
  "regPlace": "string",
  "transferOwner": "string",
  "transferContact": "string",
  "transferRemark": "string"
}
```

### NGO Transfer

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/pets/{petID}/detail-info/NGOtransfer` | Transfer pet from NGO to user |

**Request Body:**
```json
{
  "UserEmail": "string (required)",
  "UserContact": "string (required)",
  "regDate": "YYYY-MM-DD or DD/MM/YYYY",
  "regPlace": "string",
  "transferOwner": "string",
  "transferContact": "string",
  "transferRemark": "string",
  "isTransferred": "boolean"
}
```

### Pet Source (v2)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v2/pets/{petID}/detail-info/source` | Get rescue/origin info |
| POST | `/v2/pets/{petID}/detail-info/source` | Create rescue/origin record |
| PUT | `/v2/pets/{petID}/detail-info/source/{sourceId}` | Update rescue/origin record |

**POST Request Body (at least one of `placeofOrigin` or `channel` required):**
```json
{
  "placeofOrigin": "string",
  "channel": "string",
  "rescueCategory": ["string"],
  "causeOfInjury": "string"
}
```

### Pet Adoption (v2)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v2/pets/{petID}/pet-adoption` | Get post-adoption record |
| POST | `/v2/pets/{petID}/pet-adoption` | Create post-adoption record |
| PUT | `/v2/pets/{petID}/pet-adoption/{adoptionId}` | Update post-adoption record |
| DELETE | `/v2/pets/{petID}/pet-adoption/{adoptionId}` | Delete post-adoption record |

**POST/PUT Request Body:**
```json
{
  "postAdoptionName": "string",
  "isNeutered": "boolean",
  "NeuteredDate": "YYYY-MM-DD",
  "firstVaccinationDate": "YYYY-MM-DD",
  "secondVaccinationDate": "YYYY-MM-DD",
  "thirdVaccinationDate": "YYYY-MM-DD",
  "followUpMonth1": "boolean",
  "followUpMonth2": "boolean",
  "...": "...",
  "followUpMonth12": "boolean"
}
```

## Response Shape

**Success:**
```json
{
  "success": true,
  "form": { ... },
  "petId": "...",
  "requestId": "..."
}
```

**Error:**
```json
{
  "success": false,
  "errorKey": "domain.errorType",
  "error": "Translated error message",
  "requestId": "..."
}
```

## Known Constraints

- Race-condition duplicate creation for adoption/source records is mitigated with code-level 409 checks; a DB unique index on `petId` is still recommended for true concurrent-request safety.
- No rate limiting applied — all routes are authenticated, no public/sensitive write flows.
