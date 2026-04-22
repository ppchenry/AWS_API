# Pet Detail Info API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Detailed / lineage / transfer / source records on top of a pet. All endpoints require Bearer JWT and ownership (pet owner or managing NGO). Privileged roles (`admin`, `developer`) bypass ownership.

Adoption placement records (`/v2/pets/{petID}/pet-adoption`) live in [PET_ADOPTION_API.md](./PET_ADOPTION_API.md).

> Conventions: [README.md](./README.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/pets/{petID}/detail-info` | Read detail / lineage |
| POST | `/pets/{petID}/detail-info` | Update detail / lineage |
| POST | `/pets/{petID}/detail-info/transfer` | Add owner-transfer record |
| PUT | `/pets/{petID}/detail-info/transfer/{transferId}` | Update transfer record |
| DELETE | `/pets/{petID}/detail-info/transfer/{transferId}` | Remove transfer record |
| PUT | `/pets/{petID}/detail-info/NGOtransfer` | NGO transfer pet to a user |
| GET | `/v2/pets/{petID}/detail-info/source` | Read source/origin record |
| POST | `/v2/pets/{petID}/detail-info/source` | Create source/origin record |
| PUT | `/v2/pets/{petID}/detail-info/source/{sourceId}` | Update source/origin record |

**Common errors across all endpoints** (omitted from per-endpoint tables unless relevant):

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.missingPetId` | Path `petID` missing |
| 400 | `petDetailInfo.errors.invalidPetIdFormat` | Path `petID` not valid ObjectId |
| 400 | `common.invalidJSON` | Malformed JSON body |
| 400 | `common.missingParams` | Empty body on POST/PUT |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.forbidden` | Not owner / NGO |
| 404 | `petDetailInfo.errors.petNotFound` | Pet missing or soft-deleted |
| 500 | `common.internalError` | |

---

### GET /pets/{petID}/detail-info

**Success (200):**

```json
{
  "success": true,
  "form": {
    "chipId": "string",
    "placeOfBirth": "string",
    "motherName": "string",
    "motherBreed": "string",
    "motherDOB": "2018-04-01T00:00:00.000Z",
    "motherChip": "string",
    "motherPlaceOfBirth": "string",
    "motherParity": 3,
    "fatherName": "string",
    "fatherBreed": "string",
    "fatherDOB": "2017-06-10T00:00:00.000Z",
    "fatherChip": "string",
    "fatherPlaceOfBirth": "string"
  },
  "petId": "..."
}
```

---

### POST /pets/{petID}/detail-info

**Body** (all fields optional, at least one required):

| Field | Type | Notes |
| --- | --- | --- |
| `chipId`, `placeOfBirth` | string | |
| `motherName`, `motherBreed`, `motherChip`, `motherPlaceOfBirth` | string | |
| `fatherName`, `fatherBreed`, `fatherChip`, `fatherPlaceOfBirth` | string | |
| `motherDOB`, `fatherDOB` | string | `DD/MM/YYYY` |
| `motherParity` | number | Coerced from string |

**Success (200):** `{ success: true, form: { ...updated }, petId: "..." }`

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.invalidDateFormat` | motherDOB / fatherDOB wrong format |
| 400 | `petDetailInfo.errors.invalidMotherParity` | motherParity not numeric |
| 400 | `common.noFieldsToUpdate` | No valid fields in body |

---

### POST /pets/{petID}/detail-info/transfer

Add a new ownership-transfer entry to the pet's `transfer[]` array.

**Body** (all optional):

| Field | Type | Notes |
| --- | --- | --- |
| `regDate` | string | `DD/MM/YYYY` |
| `regPlace` | string | |
| `transferOwner` | string | |
| `transferContact` | string | |
| `transferRemark` | string | Default `""` |

**Success (200):**

```json
{
  "success": true,
  "form": {
    "_id": "...",
    "regDate": "2025-02-01T00:00:00.000Z",
    "regPlace": "Hong Kong",
    "transferOwner": "Jane",
    "transferContact": "+852...",
    "transferRemark": ""
  },
  "petId": "...",
  "transferId": "..."
}
```

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.transferPath.invalidDateFormat` | regDate wrong format |
| 400 | `petDetailInfo.errors.transferPath.invalidIdFormat` | Sub-resource ID invalid |

---

### PUT /pets/{petID}/detail-info/transfer/{transferId}

Update an existing transfer record. Same body shape as POST.

**Success (200):** `{ success: true, form: { ...provided }, petId: "...", transferId: "..." }`

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.transferPath.invalidDateFormat` | Bad date |
| 400 | `petDetailInfo.errors.transferPath.invalidIdFormat` | transferId invalid |
| 400 | `common.noFieldsToUpdate` | Empty valid fields |
| 404 | `petDetailInfo.errors.transferPath.notFound` | Transfer record not found |

---

### DELETE /pets/{petID}/detail-info/transfer/{transferId}

Remove a transfer record. No body.

**Success (200):** `{ success: true, petId: "...", transferId: "..." }`

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.transferPath.invalidIdFormat` | |
| 404 | `petDetailInfo.errors.transferPath.notFound` | |

---

### PUT /pets/{petID}/detail-info/NGOtransfer

Transfer NGO-held pet to a target user. Caller's role must be `ngo`. The target user is validated by both email **and** phone â€” both must resolve to the same user record. On success, `pet.userId` is reassigned and `pet.ngoId` cleared.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `UserEmail` | string | Yes | Valid email |
| `UserContact` | string | Yes | Valid phone |
| `regDate` | string | No | `DD/MM/YYYY` |
| `regPlace` | string | No | |
| `transferOwner` | string | No | |
| `transferContact` | string | No | |
| `transferRemark` | string | No | |
| `isTransferred` | boolean | No | |

**Success (200):** `{ success: true, form: { ...submitted }, petId: "..." }`

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.ngoTransfer.missingRequiredFields` | UserEmail / UserContact missing |
| 400 | `petDetailInfo.errors.ngoTransfer.invalidEmailFormat` | Bad email |
| 400 | `petDetailInfo.errors.ngoTransfer.invalidPhoneFormat` | Bad phone |
| 400 | `petDetailInfo.errors.ngoTransfer.invalidDateFormat` | Bad regDate |
| 400 | `petDetailInfo.errors.ngoTransfer.userIdentityMismatch` | Email and phone resolve to different users |
| 403 | `common.forbidden` | Caller role â‰  `ngo` |
| 404 | `petDetailInfo.errors.ngoTransfer.targetUserNotFound` | Target user missing (generic â€” anti-enumeration) |

---

### GET /v2/pets/{petID}/detail-info/source

Return the pet's source/origin record. Returns **200 with `form: null`** when no source record exists (not 404).

**Success (200):**

```json
{
  "success": true,
  "form": {
    "_id": "...",
    "placeofOrigin": "string",
    "channel": "string",
    "rescueCategory": ["injured"],
    "causeOfInjury": "string",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "petId": "...",
  "sourceId": "..."
}
```

---

### POST /v2/pets/{petID}/detail-info/source

Create the pet's source record. Only one source per pet (409 on duplicate). At least `placeofOrigin` or `channel` is required.

**Body** (all optional, cross-field rule: `placeofOrigin` OR `channel`):

| Field | Type | Notes |
| --- | --- | --- |
| `placeofOrigin` | string | |
| `channel` | string | |
| `rescueCategory` | string[] | |
| `causeOfInjury` | string | |

**Success (201):** Same shape as GET with `sourceId` populated.

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.petSource.missingRequiredFields` | Neither `placeofOrigin` nor `channel` |
| 400 | `petDetailInfo.errors.petSource.invalidSourceIdFormat` | |
| 409 | `petDetailInfo.errors.petSource.duplicateRecord` | Source record already exists |

---

### PUT /v2/pets/{petID}/detail-info/source/{sourceId}

Update the pet's source record.

**Body:** same fields as POST, all optional.

**Success (200):** `{ success: true, petId: "...", sourceId: "..." }`

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petDetailInfo.errors.petSource.invalidSourceIdFormat` | sourceId invalid |
| 400 | `petDetailInfo.errors.petSource.noFieldsToUpdate` | No valid fields |
| 404 | `petDetailInfo.errors.petSource.recordNotFound` | Source record not found |
