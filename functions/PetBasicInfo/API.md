# PetBasicInfo Lambda — API Documentation

## Base URL

```text
{API_GATEWAY_URL}/pets/{petID}
```

## Authentication

All endpoints require a valid JWT Bearer token in the `Authorization` header.

```text
Authorization: Bearer <token>
```

Returns `401` if the token is missing, expired, or invalid.
Returns `403` if the token is valid but the caller does not own the pet and is not authorized through the pet's `ngoId`.

## Language

Responses are localized. Set the language via:

- **Cookie**: `language=en` or `language=zh`
- **Query parameter**: `?lang=en` or `?lang=zh`
- **Default**: `zh` (Traditional Chinese)

## Common Error Response Shape

All error responses follow this format:

```json
{
  "success": false,
  "errorKey": "petBasicInfo.errors.petNotFound",
  "error": "Translated error message",
  "requestId": "aws-request-id"
}
```

## Common Success Response Shape

All success responses follow this format:

```json
{
  "success": true,
  "message": "Translated success message",
  ...additional fields
}
```

---

## Endpoints

### 1. Get Pet Basic Info

```text
GET /pets/{petID}/basic-info
```

Retrieves the basic profile information for a pet.

#### Update Path Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `petID` | string (ObjectId) | Yes | The pet's MongoDB ID |

**Success Response** — `200 OK`

```json
{
  "success": true,
  "message": "Pet basic info retrieved successfully",
  "form": {
    "userId": "ObjectId",
    "name": "Buddy",
    "breedimage": ["https://example.com/img1.jpg"],
    "animal": "dog",
    "birthday": "2020-01-15T00:00:00.000Z",
    "weight": 12.5,
    "sex": "male",
    "sterilization": true,
    "sterilizationDate": "2021-06-01T00:00:00.000Z",
    "adoptionStatus": "adopted",
    "breed": "Golden Retriever",
    "bloodType": "DEA 1.1+",
    "features": "Friendly, loves water",
    "info": "Additional notes",
    "status": "active",
    "owner": "John Doe",
    "ngoId": "ngo-123",
    "ownerContact1": 91234567,
    "ownerContact2": 98765432,
    "contact1Show": true,
    "contact2Show": false,
    "tagId": "TAG-001",
    "isRegistered": true,
    "receivedDate": "2020-03-01T00:00:00.000Z",
    "ngoPetId": "NGO-PET-001",
    "createdAt": "2020-01-15T00:00:00.000Z",
    "updatedAt": "2024-12-01T00:00:00.000Z",
    "location": "Kowloon Shelter",
    "position": "A-12"
  },
  "id": "ObjectId"
}
```

#### Error Responses

| Status | Condition |
| ------ | --------- |
| `400` | Invalid pet ID format |
| `401` | Authentication required |
| `403` | Caller does not own the pet and is not authorized through the pet NGO |
| `404` | Pet not found |
| `410` | Pet has been deleted |

---

### 2. Update Pet Basic Info

```text
PUT /pets/{petID}/basic-info
```

Updates one or more fields on the pet's basic profile. Unknown fields are rejected.

#### Path Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `petID` | string (ObjectId) | Yes | The pet's MongoDB ID |

**Request Body** — `application/json`

All fields are optional. At least one must be provided.

| Field | Type | Validation |
| ----- | ---- | ---------- |
| `name` | string | — |
| `breedimage` | string[] | Each must be a valid HTTP/HTTPS URL |
| `animal` | string | — |
| `birthday` | string | `DD/MM/YYYY`, `YYYY-MM-DD`, or ISO format |
| `weight` | number | Must be a number |
| `sex` | string | — |
| `sterilization` | boolean | Must be true/false |
| `sterilizationDate` | string | `DD/MM/YYYY`, `YYYY-MM-DD`, or ISO format |
| `adoptionStatus` | string | — |
| `breed` | string | — |
| `bloodType` | string | — |
| `features` | string | — |
| `info` | string | — |
| `status` | string | — |
| `owner` | string | — |
| `ngoId` | string | — |
| `ownerContact1` | number | Must be a number |
| `ownerContact2` | number | Must be a number |
| `contact1Show` | boolean | Must be true/false |
| `contact2Show` | boolean | Must be true/false |
| `isRegistered` | boolean | Must be true/false |
| `receivedDate` | string | `DD/MM/YYYY`, `YYYY-MM-DD`, or ISO format |
| `location` | string | Mapped to `locationName` in DB |
| `position` | string | — |

> **Note**: `tagId` and `ngoPetId` are **not updatable** through this endpoint. Sending them will return a validation error.

#### Update Example Request

```json
{
  "name": "Buddy Jr.",
  "weight": 13.2,
  "sterilization": true,
  "birthday": "15/01/2020"
}
```

**Success Response** — `200 OK`

```json
{
  "success": true,
  "message": "Pet basic info updated successfully",
  "id": "ObjectId"
}
```

#### Update Error Responses

| Status | Condition |
| ------ | --------- |
| `400` | Invalid JSON body |
| `400` | Empty update body |
| `400` | Validation error (wrong type, invalid date, invalid URL, unknown field) |
| `400` | No valid fields to update |
| `401` | Authentication required |
| `403` | Caller does not own the pet and is not authorized through the pet NGO |
| `404` | Pet not found |
| `410` | Pet has been deleted |
| `500` | Database error |

---

### 3. Delete Pet (Soft Delete)

```text
DELETE /pets/{petID}
```

Soft-deletes a pet by setting `deleted: true` and clearing `tagId`. The record remains in the database.

#### Delete Path Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `petID` | string (ObjectId) | Yes | The pet's MongoDB ID |

**Success Response** — `200 OK`

```json
{
  "success": true,
  "message": "Pet deleted successfully",
  "petId": "ObjectId"
}
```

#### Delete Error Responses

| Status | Condition |
| ------ | --------- |
| `400` | Invalid pet ID format |
| `401` | Authentication required |
| `403` | Caller does not own the pet and is not authorized through the pet NGO |
| `404` | Pet not found |
| `410` | Pet already deleted |
| `500` | Database error |

---

### 4. Get Eye Analysis Logs

```text
GET /pets/{petID}/eyeLog
```

Retrieves the eye analysis records for a pet, sorted by most recent first. Returns up to 100 records.

#### Eye Log Path Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `petID` | string (ObjectId) | Yes | The pet's MongoDB ID |

**Success Response** — `200 OK`

```json
{
  "success": true,
  "message": "Retrieve eye analysis log list successfully!",
  "result": [
    {
      "_id": "ObjectId",
      "petId": "ObjectId",
      "image": "https://example.com/eye1.jpg",
      "result": { ... },
      "side": "left",
      "createdAt": "2024-11-01T00:00:00.000Z",
      "updatedAt": "2024-11-01T00:00:00.000Z"
    }
  ]
}
```

#### Eye Log Error Responses

| Status | Condition |
| ------ | --------- |
| `400` | Invalid pet ID format |
| `401` | Authentication required |
| `403` | Caller does not own the pet and is not authorized through the pet NGO |
| `404` | Pet not found |
| `410` | Pet has been deleted |
| `500` | Error retrieving eye log |

---

## CORS

- Allowed origins are configured via the `ALLOWED_ORIGINS` environment variable (comma-separated)
- `OPTIONS` preflight requests are handled automatically and return `204` for allowed origins or `403` for disallowed origins
- Credentials are supported (`Access-Control-Allow-Credentials: true`)

## Global Error Codes

| Status | Meaning |
| ------ | ------- |
| `400` | Bad request (validation, format, missing data) |
| `401` | Authentication required |
| `404` | Resource not found |
| `405` | Method not allowed |
| `410` | Resource has been deleted |
| `500` | Internal server error |
