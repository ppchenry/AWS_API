# PetVaccineRecords Lambda — API Documentation

## Base URL

```text
{API_GATEWAY_URL}/pets/{petID}/vaccine-record
```

## Authentication

All endpoints require a valid JWT Bearer token in the `Authorization` header.

```text
Authorization: Bearer <token>
```

Returns `401` if the token is missing, malformed, expired, or invalid.
Returns `403` if the caller is neither the pet owner nor an authorized NGO tied to the pet.

## Common Error Response Shape

```json
{
  "success": false,
  "errorKey": "others.invalidJSON",
  "error": "Translated error message",
  "requestId": "aws-request-id"
}
```

## Common Success Response Shape

```json
{
  "success": true,
  "message": "Pet vaccine record retrieved successfully",
  "requestId": "aws-request-id"
}
```

`message` is localized server-side before the response is returned.

## Routes

### GET /pets/{petID}/vaccine-record

- Auth: required
- Description: returns the active vaccine records for the requested pet after owner-or-NGO access is confirmed.

Success response:

```json
{
  "success": true,
  "message": "Pet vaccine record retrieved successfully",
  "petId": "<petId>",
  "form": {
    "vaccineRecords": [
      {
        "_id": "<recordId>",
        "petId": "<petId>",
        "vaccineDate": "2025-01-05T00:00:00.000Z",
        "vaccineName": "Rabies",
        "vaccineNumber": "RAB-001",
        "vaccineTimes": "1",
        "vaccinePosition": "left shoulder"
      }
    ]
  }
}
```

Soft-deleted records are not returned.

### POST /pets/{petID}/vaccine-record

- Auth: required
- Description: creates a vaccine record for the requested pet.

Request body:

```json
{
  "vaccineDate": "2025-01-05",
  "vaccineName": "Rabies",
  "vaccineNumber": "RAB-001",
  "vaccineTimes": "1",
  "vaccinePosition": "left shoulder"
}
```

Notes:

- At least one field must be present.
- `vaccineDate` accepts valid `YYYY-MM-DD` or `DD/MM/YYYY` dates.

Success response:

```json
{
  "success": true,
  "message": "Pet vaccine record created successfully",
  "petId": "<petId>",
  "vaccineId": "<recordId>",
  "form": {
    "_id": "<recordId>",
    "petId": "<petId>",
    "vaccineDate": "2025-01-05T00:00:00.000Z",
    "vaccineName": "Rabies",
    "vaccineNumber": "RAB-001",
    "vaccineTimes": "1",
    "vaccinePosition": "left shoulder"
  }
}
```

### PUT /pets/{petID}/vaccine-record/{vaccineID}

- Auth: required
- Description: updates an existing active vaccine record scoped to both `petID` and `vaccineID`.

Request body:

```json
{
  "vaccineTimes": "2",
  "vaccinePosition": "right shoulder"
}
```

Notes:

- Empty bodies return `400 others.missingParams`.
- Unknown fields are rejected through the Zod schema/update mapping path.
- Soft-deleted records return `404 vaccineRecord.vaccineRecordNotFound`.

Success response:

```json
{
  "success": true,
  "message": "Pet vaccine record updated successfully",
  "petId": "<petId>",
  "vaccineId": "<recordId>",
  "form": {
    "_id": "<recordId>",
    "petId": "<petId>",
    "vaccineTimes": "2",
    "vaccinePosition": "right shoulder"
  }
}
```

### DELETE /pets/{petID}/vaccine-record/{vaccineID}

- Auth: required
- Description: soft-deletes the requested vaccine record.

Behavior:

- The row is retained in MongoDB.
- The Lambda sets `isDeleted: true` and `deletedAt`.
- Subsequent reads, updates, counts, and latest-date maintenance ignore the deleted record.

Success response:

```json
{
  "success": true,
  "message": "Pet vaccine record deleted successfully",
  "id": "<petId>"
}
```

## Known Constraints

- Pet existence and ownership checks are DB-backed, so an authorized pet record must exist before CRUD logic runs.
- This Lambda does not expose restore/undelete behavior for vaccine records.
- Success `message` values are translated localized strings generated server-side.
