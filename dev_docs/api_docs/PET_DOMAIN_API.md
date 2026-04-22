# Pet Domain API Documentation

This document covers the four pet-domain Lambdas completed in stage-1 modernization:

* `PetVaccineRecords` — vaccine record CRUD (owner/NGO-scoped, authenticated)
* `CreatePetBasicInfo` — pet registration (owner-authenticated)
* `GetAdoption` — adoption listing and detail (public)
* `PetInfoByPetNumber` — pet lookup by physical tag ID (public, anti-enumeration)

All routes follow the monorepo standard error envelope:

```json
{
  "success": false,
  "errorKey": "scope.errorCode",
  "requestId": "<uuid>"
}
```

---

## PetVaccineRecords

**Base path:** `/pets/{petId}/vaccine-record`

Authentication: Bearer JWT required for all non-OPTIONS requests.
Authorization: owner (`userId` in JWT must match pet `userId`) or NGO (`ngoId` in JWT must match pet `ngoId`).

### GET `/pets/{petId}/vaccine-record`

Returns the active (non-soft-deleted) vaccine records for the specified pet.

**Auth:** Required — owner or NGO.

**Path parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `petId` | MongoDB ObjectId string | ID of the pet |

**Success response — `200`:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "petId": "...",
      "vaccineName": "Rabies",
      "vaccineDate": "2024-06-01",
      "nextDueDate": "2025-06-01"
    }
  ]
}
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `400` | `vaccine.invalidPetId` | `petId` is not a valid ObjectId |
| `401` | `auth.unauthorized` | Missing, expired, tampered, or `alg:none` JWT |
| `403` | — | Stranger access (not owner, not matching NGO) |
| `404` | `vaccine.petNotFound` | No pet with that `petId` exists |

---

### POST `/pets/{petId}/vaccine-record`

Creates a new vaccine record for the specified pet.

**Auth:** Required — owner only.

**Path parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `petId` | MongoDB ObjectId string | ID of the pet |

**Request body (JSON):**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `vaccineName` | string | Yes | Name of the vaccine |
| `vaccineDate` | YYYY-MM-DD | Yes | Date the vaccine was administered |
| `nextDueDate` | YYYY-MM-DD | No | Recommended next due date |
| `notes` | string | No | Optional notes |

**Success response — `200`:**

```json
{
  "success": true,
  "data": { "vaccineRecordId": "..." }
}
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `400` | `vaccine.invalidBody` | Empty or malformed JSON, empty body, impossible date, unknown field |
| `400` | `vaccine.noSqlInjection` | Object passed where scalar string expected |
| `401` | `auth.unauthorized` | JWT invalid |
| `403` | — | Stranger or NGO attempt to write |
| `404` | `vaccine.petNotFound` | Pet not found |

---

### PUT `/pets/{petId}/vaccine-record/{vaccineId}`

Updates an existing vaccine record. Accepts a partial update body; at least one valid field required.

**Auth:** Required — owner only.

**Path parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `petId` | MongoDB ObjectId string | ID of the pet |
| `vaccineId` | MongoDB ObjectId string | ID of the vaccine record |

**Request body (JSON):** same optional fields as POST.

**Success response — `200`:**

```json
{ "success": true }
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `400` | `vaccine.invalidBody` | Empty PUT body or unknown fields only |
| `400` | `vaccine.invalidVaccineId` | `vaccineId` is not a valid ObjectId |
| `401` | `auth.unauthorized` | JWT invalid |
| `403` | — | Stranger attempt |
| `404` | `vaccine.notFound` | Vaccine record not found or addressed via wrong `petId` |

---

### DELETE `/pets/{petId}/vaccine-record/{vaccineId}`

Soft-deletes a vaccine record (sets `deleted: true`). The record will no longer appear in GET responses.

**Auth:** Required — owner only.

**Success response — `200`:**

```json
{ "success": true }
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `401` | `auth.unauthorized` | JWT invalid |
| `403` | — | Stranger attempt |
| `404` | `vaccine.notFound` | Vaccine record not found |

---

## CreatePetBasicInfo

**Path:** `POST /pets/create-pet-basic-info`

Creates a new pet document. The `userId` is always injected server-side from the verified JWT; callers cannot supply it.

**Auth:** Bearer JWT required.

**Request body (JSON):**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Pet name |
| `species` | string | Yes | e.g. `"dog"`, `"cat"` |
| `breed` | string | No | Breed name |
| `gender` | string | Yes | e.g. `"male"`, `"female"` |
| `birthday` | YYYY-MM-DD | Yes | Pet's date of birth |
| `tagId` | string | No | Physical NFC/QR tag ID (must be unique) |
| `photoUrl` | string | No | URL to profile photo |

Fields `userId` and `ngoId` are explicitly **rejected** if supplied in the body (unknown-field rejection via Zod `superRefine`).

**Success response — `201`:**

```json
{
  "success": true,
  "data": {
    "petId": "...",
    "tagId": "...",
    "name": "Buddy",
    "species": "dog",
    "gender": "male",
    "birthday": "2022-01-15"
  }
}
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `400` | `pet.invalidBody` | Malformed JSON, empty body, missing required field |
| `400` | `pet.unknownField` | Body includes `userId`, `ngoId`, or other disallowed fields |
| `400` | `pet.noSqlInjection` | Object passed in string field |
| `401` | `auth.unauthorized` | JWT invalid |
| `405` | `others.methodNotAllowed` | Non-POST method |
| `409` | `pet.duplicateTag` | `tagId` already exists |
| `429` | `others.rateLimited` | Create attempts exceeded per-user rate limit |

---

## GetAdoption

Public endpoints — no authentication required.

### GET `/adoption`

Returns a paginated list of pets available for adoption.

**Query parameters:**

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | integer ≥ 1 | `1` | Page number |
| `limit` | integer | `10` | Items per page (server-capped) |
| `search` | string ≤ 100 chars | — | Text search across name and description |
| `species` | string | — | Filter by species |
| `gender` | string | — | Filter by gender |

**Success response — `200`:**

```json
{
  "success": true,
  "data": {
    "items": [ { "...adoption fields..." } ],
    "page": 1,
    "maxPage": 5,
    "total": 48
  }
}
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `400` | `adoption.invalidPage` | `page` is 0, negative, or non-numeric |
| `400` | `adoption.searchTooLong` | `search` exceeds 100 characters |
| `405` | `others.methodNotAllowed` | Non-GET method |

---

### GET `/adoption/{id}`

Returns the full adoption form detail for a single adoption record.

**Path parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | MongoDB ObjectId string | Adoption pet document ID |

**Success response — `200`:**

```json
{
  "success": true,
  "data": {
    "pet": {
      "basicInfo": { "...fields..." },
      "detailInfo": { "...fields..." },
      "Remark": "...",
      "...adoption-website required fields..."
    }
  }
}
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `400` | `adoption.invalidId` | `id` is not a valid MongoDB ObjectId |
| `404` | `adoption.notFound` | No adoption record with that ID |
| `405` | `others.methodNotAllowed` | `POST /adoption/{id}` (removed route) |

---

## PetInfoByPetNumber

Public endpoint — no authentication required.

### GET `/pets/getPetInfobyTagId/{tagId}`

Returns sanitized public information about a pet identified by its physical NFC/QR tag ID.

**Security note:** This endpoint uses an **anti-enumeration pattern**. A valid `tagId` that is not found or belongs to a soft-deleted pet returns `200` with an all-null form rather than `404`. Callers cannot use the status code to determine whether a tag ID exists.

**Path parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `tagId` | string (1–120 chars) | Physical tag ID printed on the pet's tag |

**Success response — `200` (tag found, pet active):**

```json
{
  "success": true,
  "data": {
    "name": "Buddy",
    "species": "dog",
    "breed": "Labrador",
    "gender": "male",
    "birthday": "2022-01-15",
    "photoUrl": "https://...",
    "contact1": "...",
    "contact2": null
  }
}
```

`contact1` and `contact2` are only included when the pet owner has enabled the corresponding `contact1Show` / `contact2Show` visibility toggle.

**Success response — `200` (tag not found or pet soft-deleted):**

```json
{
  "success": true,
  "data": {
    "name": null,
    "species": null,
    "breed": null,
    "gender": null,
    "birthday": null,
    "photoUrl": null,
    "contact1": null,
    "contact2": null
  }
}
```

**Error responses:**

| Status | `errorKey` | Condition |
| --- | --- | --- |
| `400` | `pet.missingTagId` | `tagId` path parameter is missing or blank |
| `400` | `pet.tagIdTooLong` | `tagId` exceeds 120 characters |
| `405` | `others.methodNotAllowed` | POST, PUT, or DELETE |

Internal fields (`userId`, `ngoId`, `ngoPetId`, `ownerContact1`, `ownerContact2`, `contact1Show`, `contact2Show`, `deleted`) are never returned.
