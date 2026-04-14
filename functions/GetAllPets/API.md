# GetAllPets API Reference

## Overview

Manages pet listing, soft-deletion, and eye image updates. Serves both user-specific and NGO-scoped pet queries.

### Refactor Status

- Current status: completed Tier 2 modularized reference implementation
- Latest verification status: `49 passed, 2 skipped` in the focused GetAllPets integration suite
- Detailed test evidence: `dev_docs/test_reports/GETALLPETS_TEST_REPORT.md`

### Security Posture Summary

- NGO pet listing is public, read-only, and guarded by exact route matching plus query validation
- User pet listing requires JWT and self-access enforcement
- Delete and eye-update mutations require JWT and ownership enforcement
- Error responses follow the standardized `success/errorKey/error/requestId` contract

## Base Path

`/pets`

## Authentication

All routes require JWT Bearer token unless marked as **Public**.

---

## Routes

### GET /pets/pet-list-ngo/{ngoId}

**Auth**: Public  
**Description**: Paginated, searchable, sortable pet list for an NGO.

**Path Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| ngoId | string (ObjectId) | Yes | The NGO identifier |

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number (1-indexed) |
| search | string | "" | Case-insensitive search across name, animal, breed, ngoPetId, owner |
| sortBy | string | "updatedAt" | Sort field. Allowed: updatedAt, createdAt, name, animal, breed, birthday, receivedDate, ngoPetId |
| sortOrder | string | "desc" | Sort direction: "asc" or "desc" |

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Pets retrieved successfully",
  "pets": [ ... ],
  "total": 42,
  "currentPage": 1,
  "perPage": 30
}
```

**Error Responses**: 400 (missing/invalid ngoId), 404 (no pets found)

---

### POST /pets/deletePet

**Auth**: JWT Required (owner only)  
**Description**: Soft-deletes a pet by setting `deleted: true`. Caller must own the pet (pet.userId === JWT userId).

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
  "petId": "..."
}
```

**Error Responses**: 400 (missing/invalid petId), 403 (not pet owner), 404 (pet not found), 409 (already deleted)

---

### PUT /pets/updatePetEye

**Auth**: JWT Required (owner only)  
**Description**: Adds an eye image record to a pet. Caller must own the pet (pet.userId === JWT userId).

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
  "result": { ... }
}
```

**Error Responses**: 400 (missing/invalid fields), 403 (not pet owner), 404 (pet not found), 410 (pet deleted)

---

### GET /pets/pet-list/{userId}

**Auth**: JWT Required (self-access only)  
**Description**: Paginated list of pets owned by a user. Caller's JWT userId must match the path userId.

**Path Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string (ObjectId) | Yes | The user identifier |

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number (1-indexed) |

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Pets retrieved successfully",
  "form": [ ... ],
  "total": 5
}
```

**Error Responses**: 400 (missing/invalid userId), 403 (not self-access)

---

## Error Response Shape

All errors follow the standardized format:
```json
{
  "success": false,
  "errorKey": "domain.errorType",
  "error": "Translated error message",
  "requestId": "aws-request-id"
}
```

## Known Constraints

- **I20 — Race-condition duplicate creation**: Not applicable (no creation flows).
- No rate limiting applied — this Lambda has no public write flows or sensitive authenticated write flows beyond soft-delete.