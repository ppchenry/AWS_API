# Media Upload & AI Analysis API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Image uploads (to S3), multipart-based pet creation / update, external eye-analysis, and breed-analysis. All endpoints require Bearer JWT.

> Conventions: [README.md](./README.md).

## Endpoints

| Method | Path | Content-Type | Purpose |
| --- | --- | --- | --- |
| POST | `/util/uploadImage` | `multipart/form-data` | Upload a single image, get S3 URL |
| POST | `/util/uploadPetBreedImage` | `multipart/form-data` | Upload a breed image to allowlisted folder |
| POST | `/pets/create-pet-basic-info-with-image` | `multipart/form-data` | Create pet + upload images |
| POST | `/pets/updatePetImage` | `multipart/form-data` | Update pet fields + manage images |
| POST | `/analysis/eye-upload/{petId}` | `multipart/form-data` | Eye analysis + heatmap |
| POST | `/analysis/breed` | `application/json` | Breed analysis |

**Lambda:** EyeUpload

All endpoints require valid Bearer JWT.

---

### POST /util/uploadImage

Upload a single JPEG or PNG image. Returns its public S3 URL.

**Rate limit:** 30 / 5 min per `userId`.

**Form fields:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| _(file)_ | binary | Yes | Exactly one file. MIME: `image/jpeg` or `image/png` |

**Success (200):**

```json
{
  "success": true,
  "message": "Successfully uploaded images of pet",
  "url": "https://s3.../user-uploads/breed_analysis/..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `eyeUpload.noFilesUploaded` | No file |
| 400 | `eyeUpload.tooManyFiles` | > 1 file |
| 400 | `eyeUpload.invalidImageFormat` | MIME not JPEG / PNG |
| 429 | `eyeUpload.rateLimited` | |
| 500 | `others.internalError` | S3 / parsing error |

---

### POST /util/uploadPetBreedImage

Upload an image to a specific S3 folder. Folder must be in the allowlist to prevent path injection.

**Rate limit:** 30 / 5 min per `userId`.

**Form fields:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| _(file)_ | binary | Yes | JPEG / PNG; one file |
| `url` | string | Yes | Folder name. Allowlist: `breed_analysis`, `pets`, `eye`, `profile`. Rejects `.` / `..` |

**Success (200):**

```json
{
  "success": true,
  "message": "Successfully uploaded images of pet",
  "url": "https://s3.../user-uploads/<folder>/..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `eyeUpload.noFilesUploaded` | |
| 400 | `eyeUpload.invalidImageFormat` | |
| 400 | `eyeUpload.invalidFolder` | Folder missing or not allowlisted |
| 429 | `eyeUpload.rateLimited` | |
| 500 | `others.internalError` | |

---

### POST /pets/create-pet-basic-info-with-image

Create a pet from multipart form data (with zero or more images). Ownership is always set from the caller's JWT — `userId` cannot be set from the body. NGO callers may set `ngoId` (must match their JWT claim).

**Rate limit:** 20 / 5 min per `userId`.

**Form fields** (unknown fields rejected):

| Field | Type | Required | Max | Notes |
| --- | --- | --- | --- | --- |
| `name` | string | **Yes** | 200 | |
| `animal` | string | **Yes** | 100 | |
| `sex` | string | **Yes** | 20 | |
| `breed` | string | No | 200 | |
| `birthday` | string | No | 20 | `DD/MM/YYYY` |
| `weight` | string | No | 20 | |
| `sterilization` | string | No | 20 | |
| `sterilizationDate` | string | No | 20 | `DD/MM/YYYY` |
| `adoptionStatus` | string | No | 50 | |
| `bloodType` | string | No | 50 | |
| `features` | string | No | 2000 | |
| `info` | string | No | 5000 | |
| `status` | string | No | 50 | |
| `owner` | string | No | 200 | |
| `ngoId` | string | No | 100 | Restricted to `ngo` role; must match JWT `ngoId` |
| `ownerContact1`, `ownerContact2` | string | No | 200 | |
| `contact1Show`, `contact2Show` | string | No | 10 | |
| `receivedDate` | string | No | 20 | `DD/MM/YYYY` |
| `location`, `position` | string | No | 500 | |
| `breedimage` | string | No | — | Alternative: provide image URL instead of files |
| _(files)_ | binary[] | No | — | JPEG / PNG, stored at `user-uploads/pets/{tempId}` |

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
| 400 | `eyeUpload.nameRequired` / `animalRequired` / `sexRequired` | Required missing |
| 400 | `eyeUpload.fieldTooLong` | Any field over max |
| 400 | `eyeUpload.invalidUrl` | `breedimage` not valid URL |
| 400 | `eyeUpload.unknownField` | Unknown form field |
| 403 | `eyeUpload.ngoRoleRequired` | `ngoId` set but role ≠ `ngo` |
| 403 | `eyeUpload.ngoIdClaimRequired` | `ngoId` set but JWT has no `ngoId` claim |
| 403 | `eyeUpload.forbidden` | JWT `ngoId` ≠ form `ngoId` |
| 404 | `eyeUpload.userNotFound` | Caller user deleted |
| 409 | `eyeUpload.duplicateNgoPetId` | Auto-generated `ngoPetId` collides |
| 429 | `eyeUpload.rateLimited` | |
| 500 | `others.internalError` | |

---

### POST /pets/updatePetImage

Update scalar pet fields and manage pet images (add + remove) in one call.

**Rate limit:** 30 / 5 min per `userId`.

**Form fields** (unknown rejected; `userId`, `isRegistered`, `deleted`, `credit` cannot be set):

| Field | Type | Required | Max | Notes |
| --- | --- | --- | --- | --- |
| `petId` | string (ObjectId) | **Yes** | — | |
| `removedIndices` | string | No | — | JSON array of integer indices into existing `breedimage` to remove, e.g. `"[0,2]"` |
| `name`, `animal`, `breed`, `bloodType`, `features`, `info`, `status`, `owner`, `tagId` | string | No | (see above) | |
| `birthday`, `sterilizationDate`, `receivedDate` | string | No | 20 | `DD/MM/YYYY` |
| `weight`, `sex`, `sterilization` | string | No | 20 | |
| `adoptionStatus` | string | No | 50 | |
| `ownerContact1`, `ownerContact2` | string | No | 200 | |
| `contact1Show`, `contact2Show` | string | No | 10 | |
| `ngoId`, `ngoPetId` | string | No | 100 | NGO owners only; must match JWT `ngoId` |
| _(files)_ | binary[] | No | — | JPEG / PNG, appended to `breedimage` |

**Success (200):**

```json
{
  "success": true,
  "message": "Pet basic info updated successfully",
  "id": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `eyeUpload.petIdRequired` | |
| 400 | `eyeUpload.invalidObjectId` | |
| 400 | `eyeUpload.fieldTooLong` | |
| 400 | `eyeUpload.invalidRemovedIndices` | Not valid JSON array of ints |
| 400 | `eyeUpload.unknownField` | |
| 403 | `eyeUpload.forbidden` | Not owner / NGO; or `ngoId` mismatch |
| 404 | `eyeUpload.petNotFound` | |
| 409 | `eyeUpload.duplicateNgoPetId` | |
| 429 | `eyeUpload.rateLimited` | |
| 500 | `others.internalError` | |

---

### POST /analysis/eye-upload/{petId}

Upload an eye image (file or URL) and forward it to the external eye-analysis + heatmap services in parallel.

**Path params:** `petId` (ObjectId); caller must own the pet.

**Rate limit:** 10 / 5 min per `userId`.

**Form fields:** Provide **either** a file **or** `image_url`, not neither.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `image_url` | string | Conditional | External HTTPS URL; required if no file |
| _(file)_ | binary | Conditional | MIME: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/tiff`; size 1 B – 30 MB |

**Success (200):**

```json
{
  "success": true,
  "result": { "...": "eye analysis result from external service" },
  "heatmap": { "...": "heatmap data (may be partial if service rejected)" },
  "request_id": "ApiLog document _id",
  "time_taken": "1234 ms",
  "status": 200
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `eyeUpload.missingPetId` / `invalidObjectId` | Path param invalid |
| 400 | `eyeUpload.missingArguments` | Neither `image_url` nor file |
| 400 | `eyeUpload.unsupportedFormat` | File MIME not allowed |
| 400 | `eyeUpload.analysisError` | External service returned validation error |
| 403 | `eyeUpload.forbidden` | Not pet owner |
| 404 | `eyeUpload.userNotFound` / `petNotFound` | |
| 413 | `eyeUpload.fileTooLarge` | > 30 MB |
| 413 | `eyeUpload.fileTooSmall` | 0 bytes |
| 429 | `eyeUpload.rateLimited` | |
| 500 | `eyeUpload.analysisError` | External service call failed |
| 500 | `others.internalError` | |

---

### POST /analysis/breed

Send species + image URL to the external breed classifier.

**Rate limit:** 20 / 5 min per `userId`.

**Body** (JSON, unknown fields rejected):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `species` | string | Yes | 1–100 chars |
| `url` | string | Yes | Valid URL |

**Success (200):**

```json
{
  "success": true,
  "message": "Successfully analyze breed",
  "result": { "...": "raw breed service response" }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `others.invalidJSON` / `others.missingParams` | |
| 400 | `eyeUpload.speciesRequired` | |
| 400 | `eyeUpload.urlRequired` | |
| 400 | `eyeUpload.invalidUrl` | |
| 400 | `eyeUpload.unknownField` | |
| 429 | `eyeUpload.rateLimited` | |
| 500 | `others.internalError` | External service error |
