# PetBiometricRoutes API

## Routes

### GET /petBiometrics/{petId}

- Auth: required
- Description: returns the stored face and nose image URLs for the requested pet after ownership or authorized NGO access is confirmed.

Success response shape:

```json
{
  "success": true,
  "petId": "<petId>",
  "faceImages": {
    "faceFrontUrls": [],
    "faceLeftUrls": [],
    "faceRightUrls": [],
    "faceUpperUrls": [],
    "faceLowerUrls": []
  },
  "noseImages": {
    "noseFrontUrls": [],
    "noseLeftUrls": [],
    "noseRightUrls": [],
    "noseUpperUrls": [],
    "noseLowerUrls": []
  },
  "request_id": "<api-log-id>",
  "time_taken": "12.34 ms"
}
```

### POST /petBiometrics/register

- Auth: required
- Description: creates or updates the stored biometric image URL arrays for a pet owned by the caller.

Request body:

```json
{
  "petId": "<petId>",
  "faceFrontArray": ["https://..."],
  "faceLeftArray": ["https://..."],
  "faceRightArray": ["https://..."],
  "faceUpperArray": ["https://..."],
  "faceLowerArray": ["https://..."],
  "noseFrontArray": ["https://..."],
  "noseLeftArray": ["https://..."],
  "noseRightArray": ["https://..."],
  "noseUpperArray": ["https://..."],
  "noseLowerArray": ["https://..."],
  "business": "optional-source-label"
}
```

Success response shape:

```json
{
  "success": true,
  "result": {
    "petId": "<petId>",
    "operation": "created",
    "isRegistered": true
  },
  "request_id": "<api-log-id>",
  "time_taken": "12.34 ms"
}
```

Status code is `201` when the biometric record is created and `200` when an existing biometric record is updated.

### POST /petBiometrics/verifyPet

- Auth: required
- Description: verifies a candidate image against the stored biometric images for the caller's pet.

Request body:

```json
{
  "petId": "<petId>",
  "access_secret": "<business-access-key>",
  "secret_key": "<business-secret-key>",
  "animalType": "dog",
  "image_url": "https://...",
  "files": [
    {
      "filename": "photo.jpg",
      "contentType": "image/jpeg",
      "content": "<base64-content>"
    }
  ]
}
```

Provide either `image_url` or `files[0]`.

Inline file uploads are supported in the deployed Lambda contract and require the AWS bucket environment variables for this function to be configured.

Credential verification uses the configured business access-key and secret-key pair and rejects requests when that pair does not resolve to a single business record.

In the latest SAM-local verification pass, the UAT-backed request lifecycle and schema/guard paths were exercised successfully. The business-database-dependent verification branches remain documented but were not fully proven end-to-end in that environment because the external business Atlas cluster was unavailable from the current machine.

Success response shape:

```json
{
  "success": true,
  "result": {
    "matched": true,
    "confidence": 0.98,
    "threshold": 0.6,
    "species": "dog",
    "message": "Match found",
    "providerRequestId": "<provider-request-id>"
  },
  "request_id": "<api-log-id>",
  "time_taken": "12.34 ms"
}
```

`result.matched` is always present on a successful `200` response. The remaining fields are optional and only appear when they are present in the accepted normalized provider payload.

## Error responses

All error responses now use the standard shared shape:

```json
{
  "success": false,
  "errorKey": "petBiometric.invalidPetId",
  "error": "Invalid pet ID.",
  "requestId": "<aws-request-id>"
}
```

## Notes

- All routes are protected by JWT.
- Ownership is derived from the verified JWT identity and pet record, not a caller-supplied `userId` field.
- Public or unsupported origins receive CORS rejection during OPTIONS handling.
- `verifyPet` supports direct image URLs and inline JSON file payloads.
- Business credential lookup is schema-backed against the business `users` collection through the configured `BUSINESS_MONGODB_URI` connection.
