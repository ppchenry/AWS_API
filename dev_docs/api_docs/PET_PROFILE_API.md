# Pet Profile API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Pet creation, basic info CRUD, pet lists, and public tag lookup. For detailed / source / transfer records see [PET_DETAIL_INFO_API.md](./PET_DETAIL_INFO_API.md). For image-based pet operations (multipart upload, eye analysis) see [MEDIA_UPLOAD_API.md](./MEDIA_UPLOAD_API.md).

> Conventions (base URL, headers, error shape) in [README.md](./README.md).

## Ownership Model

Pet-scoped endpoints resolve access via:

- **Owner**: `pet.userId === event.userId`
- **NGO**: `pet.ngoId === event.ngoId` (caller's role is `ngo`)
- **Privileged** (`admin` / `developer`): bypasses both checks

Unauthorized access returns `403 common.unauthorized` or `403 common.forbidden` (varies by Lambda). `404` is returned for soft-deleted pets to avoid leaking existence.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/pets/create-pet-basic-info` | Bearer JWT | Create pet from JSON |
| GET | `/pets/{petID}/basic-info` | Bearer JWT (owner/NGO) | Read pet basic info |
| PUT | `/pets/{petID}/basic-info` | Bearer JWT (owner/NGO) | Update pet basic info |
| DELETE | `/pets/{petID}` | Bearer JWT (owner/NGO) | Soft-delete pet |
| GET | `/pets/{petID}/eyeLog` | Bearer JWT (owner/NGO) | Eye analysis history |
| GET | `/pets/pet-list/{userId}` | Bearer JWT (self) | List user's pets |
| GET | `/pets/pet-list-ngo/{ngoId}` | Public | List NGO's pets |
| POST | `/pets/deletePet` | Bearer JWT (owner) | Legacy body-based delete |
| PUT | `/pets/updatePetEye` | Bearer JWT (owner) | Append left/right eye image URLs |
| GET | `/pets/getPetInfobyTagId/{tagId}` | Public | Public tag-ID lookup |

---

### POST /pets/create-pet-basic-info

Create a pet owned by the authenticated user. Rejects duplicate `tagId`.

**Lambda:** CreatePetBasicInfo  
**Auth:** Bearer JWT  
**Rate limit:** 20 requests / 300 s per `userId`

**Body** (unknown fields rejected):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | Yes | Non-empty |
| `birthday` | string | Yes | `DD/MM/YYYY` |
| `sex` | string | Yes | Non-empty |
| `animal` | string | Yes | Non-empty |
| `breed` | string | No | |
| `weight` | number | No | Finite |
| `sterilization` | boolean | No | |
| `features` | string | No | |
| `info` | string | No | |
| `status` | string | No | |
| `breedimage` | string[] | No | Each must be a valid image URL |
| `tagId` | string | No | Unique across all pets |
| `receivedDate` | string | No | `DD/MM/YYYY` |
| `lang` | string | No | Localization hint |

**Success (201):**

```json
{
  "success": true,
  "message": "pet.create.success",
  "id": "665f1a2b3c4d5e6f7a8b9c0d",
  "result": {
    "name": "Fluffy",
    "birthday": "2020-03-15T00:00:00.000Z",
    "weight": 4.2,
    "sex": "female",
    "sterilization": true,
    "animal": "cat",
    "breed": "Persian",
    "features": "...",
    "info": "...",
    "status": "active",
    "breedimage": ["https://..."],
    "tagId": "TAG-12345",
    "receivedDate": null
  }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `createPetBasicInfo.errors.missingName` / `createPetBasicInfo.errors.missingBirthday` / `createPetBasicInfo.errors.missingSex` / `createPetBasicInfo.errors.missingAnimal` | Required field empty |
| 400 | `createPetBasicInfo.errors.invalidDateFormat` | `birthday` or `receivedDate` not `DD/MM/YYYY` |
| 400 | `createPetBasicInfo.errors.invalidImageUrlFormat` | `breedimage` element invalid |
| 400 | `createPetBasicInfo.errors.unknownField` | Unknown field in body |
| 400 | `common.invalidJSON` | Malformed JSON |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 404 | `createPetBasicInfo.errors.userNotFound` | Caller's user record missing / deleted |
| 409 | `createPetBasicInfo.errors.duplicatePetTagId` | `tagId` already exists |
| 429 | `common.rateLimited` | 20 / 300s exceeded |
| 500 | `common.internalError` | |

---

### GET /pets/{petID}/basic-info

**Lambda:** PetBasicInfo  
**Auth:** Bearer JWT (owner or NGO)

**Success (200):**

```json
{
  "success": true,
  "message": "petBasicInfo.success.retrievedSuccessfully",
  "form": {
    "_id": "...",
    "name": "...",
    "animal": "...",
    "breed": "...",
    "birthday": "...",
    "weight": 0,
    "sex": "...",
    "sterilization": false,
    "adoptionStatus": false,
    "isRegistered": false,
    "breedimage": ["..."],
    "bloodType": "...",
    "features": "...",
    "info": "...",
    "status": "...",
    "ownerContact1": 0,
    "ownerContact2": 0,
    "contact1Show": true,
    "contact2Show": true,
    "receivedDate": "...",
    "sterilizationDate": "...",
    "locationName": "...",
    "position": "..."
  },
  "id": "..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Not owner / NGO |
| 404 | `petBasicInfo.errors.petNotFound` | Pet not found / deleted |
| 500 | `common.internalError` | |

---

### PUT /pets/{petID}/basic-info

Update any subset of editable basic-info fields. At least one field is required.

**Lambda:** PetBasicInfo  
**Auth:** Bearer JWT (owner or NGO)

**Body** (all optional; unknown fields rejected):

| Field | Type | Notes |
| --- | --- | --- |
| `name` / `animal` / `breed` / `bloodType` / `features` / `info` / `status` | string | |
| `birthday` / `receivedDate` / `sterilizationDate` | string | `DD/MM/YYYY` |
| `weight` | number | |
| `sex` | string | |
| `sterilization` / `adoptionStatus` / `isRegistered` | boolean | |
| `breedimage` | string[] | Valid image URLs |
| `ownerContact1` / `ownerContact2` | number | |
| `contact1Show` / `contact2Show` | boolean | |
| `location` | string | Stored as `locationName` |
| `position` | string | |

**Success (200):** `{ success: true, message: "petBasicInfo.success.updatedSuccessfully", form: { ...updated }, id: "..." }`

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petBasicInfo.errors.validationError` | Zod validation |
| 400 | `petBasicInfo.errors.invalidImageUrl` | Bad image URL |
| 400 | `petBasicInfo.errors.invalidBirthdayFormat` | Date format wrong |
| 400 | `petBasicInfo.errors.invalidWeightType` | weight not numeric |
| 400 | `petBasicInfo.errors.invalidOwnerContact1Type` | ownerContact1 not number |
| 400 | `petBasicInfo.errors.noValidFieldsToUpdate` | No allowlisted fields in body |
| 400 | `petBasicInfo.errors.emptyUpdateBody` | Empty body |
| 400 | `petBasicInfo.errors.invalidUpdateField` | Unknown field |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Not owner / NGO |
| 404 | `petBasicInfo.errors.petNotFound` | Pet missing |
| 500 | `common.internalError` | |

---

### DELETE /pets/{petID}

Soft-delete pet (sets `deleted: true`, clears `tagId`).

**Lambda:** PetBasicInfo  
**Auth:** Bearer JWT (owner or NGO)

**Success (200):** `{ success: true, message: "petBasicInfo.success.deletedSuccessfully" }`

**Errors:** Same as GET `/pets/{petID}/basic-info`.

---

### GET /pets/{petID}/eyeLog

Return recent eye analysis logs for the pet.

**Lambda:** PetBasicInfo  
**Auth:** Bearer JWT (owner or NGO)

**Success (200):**

```json
{
  "success": true,
  "message": "petBasicInfo.success.eyeLogRetrievedSuccessfully",
  "result": [
    {
      "_id": "...",
      "petId": "...",
      "image": "https://...",
      "eyeSide": "left",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

Sorted `createdAt: -1`, max 100 records.

**Errors:** Same as GET basic-info.

---

### GET /pets/pet-list/{userId}

List pets owned by the authenticated user, paginated.

**Lambda:** GetAllPets  
**Auth:** Bearer JWT; path `userId` must match JWT `userId`  
**Page size:** **10**

**Query params:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | number | `1` | 1-indexed |

**Success (200):**

```json
{
  "success": true,
  "message": "getPetsByUser.success",
  "form": [
    {
      "_id": "...",
      "name": "Fluffy",
      "birthday": "2020-03-15T00:00:00.000Z",
      "weight": 4.2,
      "sex": "female",
      "animal": "cat",
      "breed": "Persian",
      "status": "active",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 23
}
```

Sort: `updatedAt: -1`.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `getAllPets.errors.getPetsByUser.missingUserId` | Path missing |
| 400 | `getAllPets.errors.getPetsByUser.invalidUserIdFormat` | userId invalid |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Path `userId` ≠ JWT `userId` |
| 500 | `common.internalError` | |

---

### GET /pets/pet-list-ngo/{ngoId}

Public list of an NGO's pets, with full search / sort / pagination.

**Lambda:** GetAllPets  
**Auth:** Public  
**Page size:** **30**

**Query params:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | number | `1` | 1-indexed |
| `search` | string | — | Regex over `name`, `animal`, `breed`, `ngoPetId`, `locationName`, `owner` |
| `sortBy` | string | `updatedAt` | Allowlist: `updatedAt`, `createdAt`, `name`, `animal`, `breed`, `birthday`, `receivedDate`, `ngoPetId` |
| `sortOrder` | string | `desc` | `asc` or `desc` |

**Success (200):**

```json
{
  "success": true,
  "message": "ngoPath.success",
  "pets": [ { "...pet object" } ],
  "total": 150,
  "currentPage": 1,
  "perPage": 30
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `getAllPets.errors.ngoPath.missingNgoId` | ngoId path missing |
| 400 | `getAllPets.errors.ngoPath.invalidNgoIdFormat` | ngoId invalid |
| 404 | `getAllPets.errors.ngoPath.noPetsFound` | No pets for NGO |
| 500 | `common.internalError` | |

---

### POST /pets/deletePet

Legacy-style soft-delete (by body `petId`). Preferred: `DELETE /pets/{petID}`.

**Lambda:** GetAllPets  
**Auth:** Bearer JWT (atomic ownership filter — only the owner can delete)  
**Rate limit:** 10 / 60 s per `userId`

**Body:**

| Field | Type | Required |
| --- | --- | --- |
| `petId` | string (ObjectId) | Yes |

**Success (200):**

```json
{ "success": true, "message": "deleteStatus.success", "petId": "..." }
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `getAllPets.errors.deleteStatus.missingPetId` | Missing petId |
| 400 | `getAllPets.errors.deleteStatus.invalidPetIdFormat` | Invalid ObjectId |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Caller does not own pet |
| 404 | `getAllPets.errors.deleteStatus.petNotFound` | Not found |
| 409 | `getAllPets.errors.deleteStatus.petAlreadyDeleted` | Already soft-deleted |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | |

---

### PUT /pets/updatePetEye

Append a left + right eye image pair (with date) to a pet's `eyeimages[]` array.

**Lambda:** GetAllPets  
**Auth:** Bearer JWT (owner only)  
**Rate limit:** 10 / 60 s per `userId`

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `petId` | string (ObjectId) | Yes | |
| `date` | string | Yes | `DD/MM/YYYY` |
| `leftEyeImage1PublicAccessUrl` | string | Yes | Valid image URL |
| `rightEyeImage1PublicAccessUrl` | string | Yes | Valid image URL |

**Success (201):** `{ success: true, message: "updatePetEye.success", result: { ...sanitized pet } }`

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `getAllPets.errors.updatePetEye.missingRequiredFields` | Any required field missing |
| 400 | `getAllPets.errors.updatePetEye.invalidPetIdFormat` | Bad ObjectId |
| 400 | `getAllPets.errors.updatePetEye.invalidDateFormat` | Not `DD/MM/YYYY` |
| 400 | `getAllPets.errors.updatePetEye.invalidImageUrlFormat` | Bad URL |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Not owner |
| 404 | `getAllPets.errors.updatePetEye.petNotFound` | |
| 410 | `getAllPets.errors.updatePetEye.petDeleted` | Pet soft-deleted |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | |

---

### GET /pets/getPetInfobyTagId/{tagId}

Public tag ID lookup. Returns a **privacy-minimised projection** — internal IDs (`_id`, `userId`, `ngoId`, `ngoPetId`) are stripped. Contact fields are respected via `contact1Show` / `contact2Show` flags.

**Lambda:** PetInfoByPetNumber  
**Auth:** Public

**Path params:** `tagId` (string, 1–120 chars)

**Success (200):**

```json
{
  "success": true,
  "message": "Pet tag lookup processed successfully",
  "form": {
    "name": "Fluffy",
    "breedimage": ["https://..."],
    "animal": "cat",
    "birthday": "2020-03-15T00:00:00.000Z",
    "weight": 4.2,
    "sex": "female",
    "sterilization": true,
    "breed": "Persian",
    "features": "...",
    "info": "...",
    "status": "active",
    "receivedDate": null
  }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petInfoByPetNumber.errors.tagIdRequired` | Missing tagId |
| 400 | `common.invalidPathParam` | tagId > 120 chars |
| 400 | `common.invalidJSON` | Malformed JSON (if body sent) |
| 404 | — | Pet not found for tagId |
| 500 | `common.internalError` | |
