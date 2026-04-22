# Pet Biometrics API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Face / nose biometric registration and identity verification via the FaceID provider.

> Conventions: [README.md](./README.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/petBiometrics/{petId}` | Read stored face / nose reference URLs |
| POST | `/petBiometrics/register` | Register (create or update) biometric reference images |
| POST | `/petBiometrics/verifyPet` | Verify a candidate image against stored references |

**Lambda:** PetBiometricRoutes

**Auth:** All endpoints require Bearer JWT. Ownership: pet owner OR NGO (`ngoId` match) OR `admin`. Rejections return `403 petBiometric.forbidden`.

**Rate limit (register + verifyPet):** 10 / 300 s per `userId`.

---

### GET /petBiometrics/{petId}

Return stored biometric URLs for the pet.

**Path params:** `petId` (ObjectId)

**Success (200):**

```json
{
  "success": true,
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "faceImages": {
    "faceFrontUrls": ["https://..."],
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
  "request_id": "<ApiLog._id>",
  "time_taken": "45 ms"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petBiometricRoutes.errors.invalidPetId` | petId not valid ObjectId |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `petBiometricRoutes.errors.forbidden` | Not owner / NGO / admin |
| 404 | `petBiometricRoutes.errors.petNotFound` | Pet missing or deleted |
| 404 | `petBiometricRoutes.errors.notRegistered` | Pet has no `PetFacialImage` record yet |
| 500 | `common.internalError` | |

---

### POST /petBiometrics/register

Create or update biometric reference image URLs for a pet. Upserts `PetFacialImage` and sets `Pet.isRegistered = true` atomically.

**Body** (JSON; all URLs must be HTTPS):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `petId` | string (ObjectId) | Yes | |
| `faceFrontArray` | string[] | Yes | Min 1 valid HTTPS URL |
| `faceLeftArray` | string[] | Yes | Min 1 |
| `faceRightArray` | string[] | Yes | Min 1 |
| `faceUpperArray` | string[] | Yes | Min 1 |
| `faceLowerArray` | string[] | Yes | Min 1 |
| `noseFrontArray` | string[] | No | Default `[]` |
| `noseLeftArray` | string[] | No | Default `[]` |
| `noseRightArray` | string[] | No | Default `[]` |
| `noseUpperArray` | string[] | No | Default `[]` |
| `noseLowerArray` | string[] | No | Default `[]` |
| `userId` | string (ObjectId) | No | If provided, must match JWT `userId` |
| `business` | string | No | Stored as `RegisteredFrom` |

**Success:**
- **`201`** on creation (new `PetFacialImage`)
- **`200`** on update

```json
{
  "success": true,
  "result": {
    "petId": "...",
    "operation": "created",
    "isRegistered": true
  },
  "request_id": "<ApiLog._id>",
  "time_taken": "120 ms"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 400 | `petBiometricRoutes.errors.petBiometric.errors.petIdRequired` / `petBiometricRoutes.errors.invalidPetId` | |
| 400 | `petBiometricRoutes.errors.petBiometric.errors.imageArrayRequired` | A required face/nose array missing or empty |
| 400 | `petBiometricRoutes.errors.petBiometric.invalidImageUrl` | URL not valid HTTPS |
| 401 | `common.unauthorized` | |
| 403 | `petBiometricRoutes.errors.forbidden` | Body `userId` Ã¢â€°Â  JWT or ownership mismatch |
| 404 | `petBiometricRoutes.errors.petNotFound` | |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | |

---

### POST /petBiometrics/verifyPet

Verify a candidate image against the pet's registered references. Requires both pet ownership **and** business credentials (`access_secret` / `secret_key`) that match a `UserBusiness` record.

**Body** (JSON; provide **either** `image_url` or `files[0]`):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `petId` | string (ObjectId) | Yes | |
| `access_secret` | string | Yes | Business access key |
| `secret_key` | string | Yes | Business secret key |
| `animalType` | string | No | e.g., `"dog"` Ã¢â‚¬â€ sent to FaceID as `species` |
| `image_url` | string | Conditional | Valid HTTPS URL |
| `userId` | string (ObjectId) | No | Must match JWT if provided |
| `files` | object[] | Conditional | Inline file upload |
| `files[].filename` | string | Yes (if `files` present) | |
| `files[].contentType` | string | Yes | Must match detected MIME |
| `files[].content` | string (base64) \| binary | Yes | |

Allowed file MIMEs: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/tiff`. Size: `> 0 B`, `Ã¢â€°Â¤ 10 MB`.

**Success (200):**

```json
{
  "success": true,
  "result": {
    "matched": true,
    "confidence": 0.92,
    "threshold": 0.8,
    "species": "dog",
    "message": "optional",
    "providerRequestId": "abc-123"
  },
  "request_id": "<ApiLog._id>",
  "time_taken": "640 ms"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 400 | `petBiometricRoutes.errors.imageRequired` | Neither `image_url` nor `files` |
| 400 | `petBiometricRoutes.errors.petBiometric.errors.petIdRequired` / `petBiometricRoutes.errors.invalidPetId` | |
| 400 | `petBiometricRoutes.errors.petBiometric.errors.accessKeyRequired` | |
| 400 | `petBiometricRoutes.errors.petBiometric.errors.secretKeyRequired` | |
| 400 | `petBiometricRoutes.errors.petBiometric.invalidImageUrl` | |
| 400 | `petBiometricRoutes.errors.unsupportedFormat` | MIME not allowed / detected MIME mismatch |
| 400 | `petBiometricRoutes.errors.invalidCredentials` | `access_secret` + `secret_key` don't match exactly one `UserBusiness` |
| 401 | `common.unauthorized` | |
| 403 | `petBiometricRoutes.errors.forbidden` | |
| 404 | `petBiometricRoutes.errors.petNotFound` | |
| 404 | `petBiometricRoutes.errors.notRegistered` | Pet has no registered face images |
| 413 | `petBiometricRoutes.errors.fileTooSmall` | 0 B |
| 413 | `petBiometricRoutes.errors.fileTooLarge` | > 10 MB |
| 429 | `common.rateLimited` | |
| 503 | `petBiometricRoutes.errors.uploadFailed` | S3 upload returned null URL |
| 503 | `common.serviceUnavailable` | FaceID provider error / unrecognized payload |
| 500 | `common.internalError` | |

