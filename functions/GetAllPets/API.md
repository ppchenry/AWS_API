# GetAllPets API Reference

## Overview

Manages pet listing, soft-deletion, and pet eye image updates. Serves both user-specific and NGO-scoped pet queries.

### Refactor Status

- Current status: completed Tier 2 modularized implementation
- Latest verification status: full integration suite `52 passed, 2 skipped` on `2026-04-17`
- Detailed test evidence: `dev_docs/test_reports/GETALLPETS_TEST_REPORT.md`

### Security Posture Summary

- NGO pet listing is public and read-only
- User pet listing requires JWT and self-access enforcement
- Delete and eye-update mutations require JWT and ownership enforcement
- Sensitive write routes are rate-limited
- Error responses use the standardized `success/errorKey/error/requestId` contract, except disallowed OPTIONS preflight

## Base Path

`/pets`

## Authentication

All routes require JWT Bearer token unless marked as **Public**.

---

## Routes

### GET /pets/pet-list-ngo/{ngoId}

**Auth**: Public  
**Description**: Paginated, searchable, sortable pet list for an NGO.

**Behavior Notes**:
- Fixed page size: `30`
- `page < 1` is coerced to `1`
- Search is case-insensitive substring matching with regex escaping applied before query execution
- Search covers `name`, `animal`, `breed`, `ngoPetId`, `locationName`, and `owner`
- Out-of-range pages return `404 ngoPath.noPetsFound`

**Path Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| ngoId | string (ObjectId) | Yes | The NGO identifier |

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number, 1-indexed. Values below 1 are coerced to 1 |
| search | string | "" | Case-insensitive search across name, animal, breed, ngoPetId, locationName, owner |
| sortBy | string | "updatedAt" | Allowed: updatedAt, createdAt, name, animal, breed, birthday, receivedDate, ngoPetId |
| sortOrder | string | "desc" | `"asc"` or `"desc"` |

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Pets retrieved successfully",
  "pets": [
    {
      "_id": "686e18987c6087e2734b97ec",
      "name": "ktest2",
      "animal": "cat",
      "breed": "",
      "ngoPetId": "KTEST1",
      "locationName": "Location 1",
      "position": "Placement 1",
      "createdAt": "2025-07-09T07:22:00.165Z",
      "updatedAt": "2026-04-01T11:15:29.265Z"
    }
  ],
  "total": 42,
  "currentPage": 1,
  "perPage": 30
}
```

**Error Responses**:
- `400` invalid NGO id format
- `404` no pets found or page beyond the available result set

---

### POST /pets/deletePet

**Auth**: JWT Required  
**Description**: Soft-deletes a pet by setting `deleted: true`. Caller must own the pet.

**Request Body**:
```json
{
  "petId": "string (ObjectId)"
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Pet deleted successfully",
  "petId": "686e18987c6087e2734b97ec"
}
```

**Error Responses**:
- `400` missing or invalid `petId`
- `401` missing or invalid JWT
- `403` authenticated caller does not own the pet
- `404` pet not found
- `409` pet already deleted
- `429` rate limited

---

### PUT /pets/updatePetEye

**Auth**: JWT Required  
**Description**: Appends one eye image record to a pet. Caller must own the pet.

**Request Body**:
```json
{
  "petId": "string (ObjectId)",
  "date": "string (date)",
  "leftEyeImage1PublicAccessUrl": "string (URL)",
  "rightEyeImage1PublicAccessUrl": "string (URL)"
}
```

**Success Response (201)**:
```json
{
  "success": true,
  "message": "Successfully updated pet eye image",
  "result": {
    "_id": "686e18987c6087e2734b97ec",
    "eyeimages": [
      {
        "date": "2026-04-17T00:00:00.000Z",
        "eyeimage_left1": "https://example.com/left.jpg",
        "eyeimage_right1": "https://example.com/right.jpg"
      }
    ]
  }
}
```

**Error Responses**:
- `400` missing or invalid fields
- `401` missing or invalid JWT
- `403` authenticated caller does not own the pet
- `404` pet not found
- `410` pet deleted
- `429` rate limited

---

### GET /pets/pet-list/{userId}

**Auth**: JWT Required  
**Description**: Paginated list of pets owned by a user. The JWT user id must match the path `userId`.

**Behavior Notes**:
- Fixed page size: `10`
- `page < 1` is coerced to `1`
- Out-of-range pages return `200` with an empty `form` array and the original `total`

**Path Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string (ObjectId) | Yes | The user identifier |

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number, 1-indexed. Values below 1 are coerced to 1 |

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Pets retrieved successfully",
  "form": [
    {
      "_id": "686e18987c6087e2734b97ec",
      "name": "ktest2"
    }
  ],
  "total": 5
}
```

**Error Responses**:
- `400` invalid user id format
- `401` missing or invalid JWT
- `403` JWT user id does not match path `userId`

---

## Error Response Shape

All standard error responses use:

```json
{
  "success": false,
  "errorKey": "domain.errorType",
  "error": "Translated error message",
  "requestId": "aws-request-id"
}
```

### Localization Notes

- Error responses default to `zh`
- Error responses accept `?lang=en` or `?lang=zh`
- Success message localization does not currently follow `?lang=en`; in this Lambda it depends on `event.cookies?.language`

### CORS / OPTIONS Exception

Disallowed or missing-origin OPTIONS preflight returns:

```json
{
  "error": "Origin not allowed"
}
```

That response does not include `success`, `errorKey`, or `requestId`.

## Known Constraints

- No create flows exist in this Lambda, so duplicate-creation race handling is not applicable here
- `POST /pets/deletePet` rate limit: 10 requests per 60 seconds per client IP plus authenticated user
- `PUT /pets/updatePetEye` rate limit: 10 requests per 60 seconds per client IP plus authenticated user
