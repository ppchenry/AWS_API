# Pet Lost / Found & Notifications API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Lost / found pet posts and per-user notifications. All endpoints require Bearer JWT.

> Conventions: [README.md](./README.md).

## Endpoints

| Method | Path | Content-Type | Purpose |
| --- | --- | --- | --- |
| GET | `/pets/pet-lost` | — | List all lost posts |
| POST | `/pets/pet-lost` | `multipart/form-data` | Create lost post |
| DELETE | `/pets/pet-lost/{petLostID}` | — | Delete own lost post |
| GET | `/pets/pet-found` | — | List all found posts |
| POST | `/pets/pet-found` | `multipart/form-data` | Create found post |
| DELETE | `/pets/pet-found/{petFoundID}` | — | Delete own found post |
| GET | `/v2/account/{userId}/notifications` | — | List own notifications |
| POST | `/v2/account/{userId}/notifications` | `application/json` | Create own notification |
| PUT | `/v2/account/{userId}/notifications/{notificationId}` | `application/json` | Archive notification |

**Lambda:** PetLostandFound

**Auth:** All endpoints require Bearer JWT. Notification endpoints enforce **self-access** (path `userId` must match JWT `userId`).

**File upload**: Up to 10 MB per file. Images are stored under `s3://.../user-uploads/pets/{petId}/` and their public URLs are written into the post's `breedimage[]` array.

---

### GET /pets/pet-lost

No query params / filters. Returns all records sorted by most recent.

**Success (200):**

```json
{
  "success": true,
  "message": "All lost pets retrieved successfully",
  "count": 42,
  "pets": [ { "...": "lost-pet document" } ]
}
```

**Errors:** `500 others.internalError`.

---

### POST /pets/pet-lost

`multipart/form-data`. Field name for images is `files` (may be multiple).

**Rate limit:** 5 uploads / 60 s per `userId`.

**Form fields:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `petId` | string (ObjectId) | No | If provided, validates caller owns the linked pet and updates `Pet.status` |
| `name` | string | Yes | |
| `sex` | string | Yes | |
| `animal` | string | Yes | |
| `lostDate` | string | Yes | `DD/MM/YYYY` |
| `lostLocation` | string | Yes | |
| `lostDistrict` | string | Yes | |
| `birthday` | string | No | `DD/MM/YYYY` |
| `weight` | string \| number | No | |
| `sterilization` | string \| boolean | No | |
| `breed` | string | No | |
| `description` | string | No | |
| `remarks` | string | No | |
| `status` | string | No | |
| `owner` | string | No | |
| `ownerContact1` | string \| number | No | |
| `files` | file[] | No | Images, up to 10 MB each |

**Success (201):**

```json
{
  "success": true,
  "message": "Successfully added pet",
  "id": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petLost.errors.nameRequired` / `sexRequired` / `animalRequired` / `lostDateRequired` / `lostLocationRequired` / `lostDistrictRequired` | Required field missing |
| 400 | (first Zod issue) | Bad format / invalid ObjectId |
| 403 | `others.selfAccessDenied` | `petId` provided but caller does not own it |
| 404 | `petLost.errors.petNotFound` | `petId` provided but doesn't exist |
| 429 | `others.rateLimited` | 5 / 60 s limit |
| 500 | `others.internalError` | |

---

### DELETE /pets/pet-lost/{petLostID}

Only the creator can delete.

**Success (200):** `{ success: true, message: "Pet lost record deleted successfully" }`

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petLost.errors.idRequired` | Path missing |
| 403 | `others.selfAccessDenied` | Not creator |
| 404 | `petLost.errors.notFound` | |
| 500 | `others.internalError` | |

---

### GET /pets/pet-found

**Success (200):**

```json
{
  "success": true,
  "message": "All found pets retrieved successfully",
  "count": 17,
  "pets": [ { "...": "found-pet document" } ]
}
```

---

### POST /pets/pet-found

`multipart/form-data`. Rate limit: 5 / 60 s per user.

**Form fields:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `animal` | string | Yes | |
| `foundDate` | string | Yes | `DD/MM/YYYY` |
| `foundLocation` | string | Yes | |
| `foundDistrict` | string | Yes | |
| `breed` | string | No | |
| `description` | string | No | |
| `remarks` | string | No | |
| `status` | string | No | |
| `owner` | string | No | |
| `ownerContact1` | string \| number | No | |
| `files` | file[] | No | |

**Success (201):** `{ success: true, message: "Successfully added pet" }`

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petFound.errors.animalRequired` / `foundDateRequired` / `foundLocationRequired` / `foundDistrictRequired` | Required field missing |
| 400 | (first Zod issue) | |
| 429 | `others.rateLimited` | |
| 500 | `others.internalError` | |

---

### DELETE /pets/pet-found/{petFoundID}

**Success (200):** `{ success: true, message: "Pet found record deleted successfully" }`

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petFound.errors.idRequired` | |
| 403 | `others.selfAccessDenied` | Not creator |
| 404 | `petFound.errors.notFound` | |
| 500 | `others.internalError` | |

---

### GET /v2/account/{userId}/notifications

**Path params:** `userId` must equal caller JWT `userId`.

**Success (200):**

```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "count": 3,
  "notifications": [ { "...": "notification doc" } ]
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `others.invalidPathParam` | `userId` not ObjectId |
| 403 | `others.selfAccessDenied` | Path ≠ JWT `userId` |
| 500 | `others.internalError` | |

---

### POST /v2/account/{userId}/notifications

`application/json`. Creates a notification for the caller.

**Path params:** `userId` must equal caller JWT `userId`.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | string | Yes | Non-empty |
| `petId` | string (ObjectId) | No | Nullable |
| `petName` | string | No | Nullable |
| `nextEventDate` | string | No | `DD/MM/YYYY`; nullable |
| `nearbyPetLost` | string | No | Nullable |

**Success (200):**

```json
{
  "success": true,
  "message": "Notification created successfully",
  "notification": { "...": "..." },
  "id": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `others.invalidJSON` | |
| 400 | `others.missingParams` | Empty body |
| 400 | `notifications.errors.typeRequired` | `type` missing |
| 400 | `notifications.errors.invalidPetId` | `petId` provided but not valid ObjectId |
| 400 | `others.invalidPathParam` | |
| 403 | `others.selfAccessDenied` | |
| 500 | `others.internalError` | |

---

### PUT /v2/account/{userId}/notifications/{notificationId}

Archives (soft-closes) the notification — the body is ignored, the service always sets `isArchived: true`.

**Path params:** `userId` (must match JWT), `notificationId` (ObjectId).

**Success (200):**

```json
{
  "success": true,
  "message": "Notification archived successfully",
  "notificationId": "..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `notifications.errors.notificationIdRequired` | |
| 400 | `others.invalidPathParam` | |
| 403 | `others.selfAccessDenied` | |
| 404 | `notifications.errors.notFound` | |
| 500 | `others.internalError` | |
