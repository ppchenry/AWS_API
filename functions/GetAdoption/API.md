# GetAdoption API Reference

## Overview

Provides public read-only adoption listing and adoption detail retrieval from the `adoption_list` MongoDB collection.

### Refactor Status

- Current status: completed modularized implementation with follow-up public-read hardening
- Latest focused verification status: `10 passed` in `__tests__/test-getadoption-unit.test.js` on `2026-04-22`

### Security Posture Summary

- Both runtime routes are public at the Lambda level
- Public routes do not invoke JWT middleware and do not attach JWT claims to the request event
- Responses include CORS headers only for allowed origins
- Public Mongo reads use explicit field projection plus response sanitization
- Error responses use the standardized `success/errorKey/error/requestId` envelope and locale translation path

## Base Path

`/adoption`

## Authentication

No JWT is required for the supported GetAdoption routes.

If this Lambda is deployed behind an API Gateway usage plan, `x-api-key` may still be required before the request reaches Lambda. That is an API Gateway concern, not a Lambda auth requirement.

## Routes

### GET /adoption

**Auth**: Public
**Description**: Returns a paginated adoption listing.

**Query Parameters**:

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | number | `1` | 1-indexed page number. Values below `1` return `400 adoption.invalidPage` |
| `search` | string | `""` | Case-insensitive substring search across `Breed`, `Animal_Type`, and `Remark`; length over `100` returns `400 adoption.invalidSearch` |
| `animal_type` | csv string | empty | Comma-separated animal types |
| `location` | csv string | empty | Comma-separated adoption sites |
| `sex` | csv string | empty | Comma-separated sex filters |
| `age` | csv string | empty | Comma-separated age buckets: `幼年`, `青年`, `成年`, `老年` |
| `lang` | string | `zh` | Response locale for translated errors |

**Behavior Notes**:

- Fixed page size: `16`
- Excludes adoption sites `Arc Dog Shelter`, `Tolobunny`, and `HKRABBIT`
- Requires `Image_URL` to be non-empty
- Sorts by parsed `Creation_Date` descending, then `_id` descending
- Projects only `_id`, `Name`, `Age`, `Sex`, `Breed`, and `Image_URL`

**Success Response (200)**:

```json
{
  "success": true,
  "adoptionList": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "Name": "Milo",
      "Age": 12,
      "Sex": "M",
      "Breed": "Shiba",
      "Image_URL": ["https://example.com/milo.jpg"]
    }
  ],
  "maxPage": 4,
  "totalResult": 57
}
```

**Error Responses**:

- `400 adoption.invalidPage`
- `400 adoption.invalidSearch`
- `405 others.methodNotAllowed`
- `500 others.internalError`

---

### GET /adoption/{id}

**Auth**: Public
**Description**: Returns one adoption pet detail document for a valid Mongo ObjectId.

**Path Parameters**:

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string (ObjectId) | Yes | Adoption document id |

**Behavior Notes**:

- Invalid or missing ids return `400 adoption.invalidPetIdFormat`
- Missing pets return `404 adoption.petNotFound`
- Projects only `_id`, `Name`, `Age`, `Sex`, `Breed`, `Image_URL`, `Remark`, `AdoptionSite`, and `URL`

**Success Response (200)**:

```json
{
  "success": true,
  "pet": {
    "_id": "507f1f77bcf86cd799439011",
    "Name": "Milo",
    "Age": 12,
    "Sex": "M",
    "Breed": "Shiba",
    "Image_URL": ["https://example.com/milo.jpg"],
    "Remark": "Friendly and playful",
    "AdoptionSite": "HKI",
    "URL": "https://example.com/adoption/milo"
  }
}
```

**Error Responses**:

- `400 adoption.invalidPetIdFormat`
- `404 adoption.petNotFound`
- `405 others.methodNotAllowed`
- `500 others.internalError`

---

### OPTIONS /adoption

### OPTIONS /adoption/{id}

**Auth**: Public preflight
**Description**: Returns `204` with CORS headers for allowed origins and `403 others.originNotAllowed` for disallowed or missing origins.