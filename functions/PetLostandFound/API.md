# PetLostandFound API

## Overview

Manages pet lost/found reports and user notifications.  
All routes require JWT authentication.

---

## Routes

### Pet Lost

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/pets/pet-lost` | JWT | List all lost pet records |
| POST | `/pets/pet-lost` | JWT | Create a lost pet record (multipart form) |
| DELETE | `/pets/pet-lost/{petLostID}` | JWT | Delete a lost pet record (ownership enforced) |

#### POST /pets/pet-lost

**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Pet name |
| animal | string | Yes | Animal type |
| sex | string | Yes | Pet sex |
| lostDate | string | Yes | DD/MM/YYYY or ISO format |
| lostLocation | string | Yes | Where the pet was lost |
| lostDistrict | string | Yes | District of loss |
| petId | string | No | Existing pet ID to link |
| birthday | string | No | DD/MM/YYYY or ISO format |
| weight | number | No | Pet weight |
| sterilization | boolean | No | Whether pet is sterilized |
| breed | string | No | Pet breed |
| description | string | No | Description |
| remarks | string | No | Additional remarks |
| status | string | No | Current status |
| owner | string | No | Owner name |
| ownerContact1 | number | No | Owner contact number |
| files | file[] | No | Image files to upload |
| breedimage | string | No | Comma-separated URLs if no files |

**Success Response** (201):
```json
{
  "success": true,
  "message": "Successfully added pet",
  "id": "ObjectId"
}
```

#### GET /pets/pet-lost

**Success Response** (200):
```json
{
  "success": true,
  "message": "All lost pets retrieved successfully",
  "count": 5,
  "pets": [...]
}
```

#### DELETE /pets/pet-lost/{petLostID}

Deletes the record only if the caller owns it (`userId` match). Returns 403 if not the owner, 404 if not found.

**Success Response** (200):
```json
{
  "success": true,
  "message": "Pet lost record deleted successfully"
}
```

---

### Pet Found

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/pets/pet-found` | JWT | List all found pet records |
| POST | `/pets/pet-found` | JWT | Create a found pet record (multipart form) |
| DELETE | `/pets/pet-found/{petFoundID}` | JWT | Delete a found pet record (ownership enforced) |

#### POST /pets/pet-found

**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| animal | string | Yes | Animal type |
| foundDate | string | Yes | DD/MM/YYYY or ISO format |
| foundLocation | string | Yes | Where the pet was found |
| foundDistrict | string | Yes | District of find |
| breed | string | No | Pet breed |
| description | string | No | Description |
| remarks | string | No | Additional remarks |
| status | string | No | Current status |
| owner | string | No | Finder name |
| ownerContact1 | number | No | Finder contact number |
| files | file[] | No | Image files to upload |
| breedimage | string | No | Image URLs if no files |

---

### Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v2/account/{userId}/notifications` | JWT + self-access | List user notifications |
| POST | `/v2/account/{userId}/notifications` | JWT + self-access | Create a notification |
| PUT | `/v2/account/{userId}/notifications/{notificationId}` | JWT + self-access | Archive a notification |

#### POST /v2/account/{userId}/notifications

**Content-Type**: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | Notification type |
| petId | string | No | Related pet ObjectId (must be valid ObjectId format) |
| petName | string | No | Related pet name |
| nextEventDate | string | No | DD/MM/YYYY or ISO format |
| nearbyPetLost | string | No | Nearby lost pet info |

**Success Response** (200):
```json
{
  "success": true,
  "message": "Notification created successfully",
  "notification": {...},
  "id": "ObjectId"
}
```

---

## Error Response Shape

All errors follow:
```json
{
  "success": false,
  "errorKey": "others.unauthorized",
  "error": "Translated error message",
  "requestId": "aws-request-id"
}
```

## Known Constraints

- Serial number generation (pet-lost/pet-found POST) has a race condition window. Only a DB unique index eliminates this. Classified as **infra-owned**.
- DELETE routes perform hard deletes. Soft-delete migration is deferred.
- POST routes for pet-lost and pet-found are rate-limited to 5 requests per 60 seconds per user.

---

## Testing

**Test suite:** `__tests__/test-petlostandfound.test.js`
**Result:** 59 / 59 passed ✅

Run with:
```bash
sam local start-api --env-vars env.json --warm-containers EAGER
npm test -- --testPathPattern=test-petlostandfound
```

Requires SAM local running on port 3000 with `env.json` providing `PetLostandFoundFunction` env vars.
