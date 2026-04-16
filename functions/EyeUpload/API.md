# EyeUpload Lambda — API Reference

## Overview

Handles pet image uploads (S3), pet creation with images, pet image updates, eye analysis via external ML endpoints, and breed analysis. All routes require JWT authentication.

## Base Path

All routes are dispatched via API Gateway resource templates.

---

## Routes

### `POST /util/uploadImage`

Upload a single image to S3 for breed analysis.

**Auth:** Required (JWT)
**Content-Type:** `multipart/form-data`
**Rate Limit:** 30 per 5 min per caller

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| files | file[] | Yes | Exactly 1 image file (JPEG or PNG) |

**Success (200):**

```json
{ "success": true, "message": "Successfully uploaded images of pet", "url": "https://..." }
```

---

### `POST /util/uploadPetBreedImage`

Upload a pet breed image to an allowlisted S3 subfolder.

**Auth:** Required (JWT)
**Content-Type:** `multipart/form-data`
**Rate Limit:** 30 per 5 min per caller

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| url | string | Yes | S3 subfolder path — must start with an allowed prefix: `breed_analysis`, `pets`, `eye`, `profile`. Path traversal (`..`) is rejected. |
| files | file | Yes | Single image file (JPEG or PNG) |

**Success (200):**

```json
{ "success": true, "message": "Successfully uploaded images of pet", "url": "https://..." }
```

---

### `POST /pets/updatePetImage`

Update a pet's images and basic info fields.

**Auth:** Required (JWT)
**Content-Type:** `multipart/form-data`
**Rate Limit:** 30 per 5 min per caller
**Ownership:** Caller must own the pet (`pet.userId === JWT userId`) or be an NGO user with matching `ngoId`.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| petId | string | Yes | The pet's ObjectId |
| removedIndices | string | No | JSON array of integer image indices to remove (returns 400 if malformed) |
| files | file[] | No | New image files to add |
| name | string | No | Pet name |
| animal | string | No | Animal type |
| birthday | string | No | Birthday (DD/MM/YYYY) |
| weight | string | No | Pet weight |
| sex | string | No | Pet sex |
| sterilization | string | No | Sterilization status |
| sterilizationDate | string | No | Sterilization date (DD/MM/YYYY) |
| adoptionStatus | string | No | Adoption status |
| breed | string | No | Pet breed |
| bloodType | string | No | Blood type |
| features | string | No | Pet features |
| info | string | No | Additional info |
| status | string | No | Pet status |
| owner | string | No | Owner name |
| tagId | string | No | Tag ID |
| ownerContact1 | string | No | Primary contact |
| ownerContact2 | string | No | Secondary contact |
| contact1Show | string | No | Show primary contact flag |
| contact2Show | string | No | Show secondary contact flag |
| receivedDate | string | No | Date received (DD/MM/YYYY) |
| ngoId | string | No | NGO-only — caller must have `ngo` role with JWT `ngoId` claim matching both the pet's current org AND the destination org |
| ngoPetId | string | No | NGO-only — same restriction as ngoId; cross-org reassignment is blocked |

Unknown fields are rejected with 400 via Zod `.strict()` schema validation.

**Success (200):**

```json
{ "success": true, "message": "Pet basic info updated successfully", "id": "..." }
```

---

### `POST /pets/create-pet-basic-info-with-image`

Create a new pet record with images.

**Auth:** Required (JWT)
**Content-Type:** `multipart/form-data`
**Rate Limit:** 20 per 5 min per caller
**Ownership:** Pet is created under the JWT caller's identity. No `userId` field is accepted.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| name | string | Yes | Pet name |
| animal | string | Yes | Animal type |
| sex | string | Yes | Pet sex |
| files | file[] | No | Pet images |
| ngoId | string | No | NGO ID — requires `ngo` role AND JWT must carry matching `ngoId` claim |
| breed | string | No | Pet breed |
| birthday | string | No | Birthday (DD/MM/YYYY) |
| weight | string | No | Pet weight |
| sterilization | string | No | Sterilization status |
| sterilizationDate | string | No | Sterilization date (DD/MM/YYYY) |
| adoptionStatus | string | No | Adoption status |
| bloodType | string | No | Blood type |
| features | string | No | Pet features |
| info | string | No | Additional info |
| status | string | No | Pet status |
| owner | string | No | Owner name |
| ownerContact1 | string | No | Primary contact |
| ownerContact2 | string | No | Secondary contact |
| contact1Show | string | No | Show primary contact flag |
| contact2Show | string | No | Show secondary contact flag |
| receivedDate | string | No | Date received (DD/MM/YYYY) |
| location | string | No | Location name |
| position | string | No | Position |
| breedimage | string | No | URL of existing breed image |

Unknown fields are rejected with 400 via Zod `.strict()` schema validation.

**Success (201):**

```json
{ "success": true, "message": "Successfully added pet", "id": "..." }
```

---

### `POST /analysis/eye-upload/{petId}`

Upload an eye image and run ML-based eye health analysis.

**Auth:** Required (JWT)
**Content-Type:** `multipart/form-data`
**Rate Limit:** 10 per 5 min per caller
**Identity:** User is identified from JWT — no `userId` field is accepted.
**Ownership:** Caller must own the pet (`pet.userId === JWT userId`) or be an NGO user with matching `ngoId` claim.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| image_url | string | No* | URL of image (if no file uploaded) |
| files | file | No* | Eye image file (JPEG/PNG/GIF/TIFF, max 30MB) |

*Either `image_url` or a file must be provided.

**Success (200):**

```json
{
  "success": true,
  "result": { "..." : "..." },
  "heatmap": "...",
  "request_id": "...",
  "time_taken": "123 ms",
  "status": 200
}
```

---

### `POST /analysis/breed`

Analyze a pet's breed from an image URL via external ML endpoint.

**Auth:** Required (JWT)
**Content-Type:** `application/json`
**Rate Limit:** 20 per 5 min per caller

```json
{ "species": "dog", "url": "https://example.com/image.jpg" }
```

**Success (200):**

```json
{ "success": true, "message": "Successfully analyze breed", "result": { "..." : "..." } }
```

---

## Deprecated Routes (405)

| Route | Reason |
| ----- | ------ |
| `PUT /pets/updatePetEye` | Moved to GetAllPets Lambda |
| `GET /pets/gets3Image` | Belongs to PetLostandFound Lambda |
| `POST /pets/create-pet-basic-info` | Moved to CreatePetBasicInfo Lambda |

These legacy routes are still handled by the EyeUpload router as explicit `405` responses for code-level safety, but `PUT /pets/updatePetEye` should not be mounted under `EyeUploadFunction` in `template.yaml` because the live SAM template already declares that path under `GetAllPetsFunction`.

---

## Error Response Shape

All errors follow the standard shape:

```json
{
  "success": false,
  "errorKey": "eyeUpload.petNotFound",
  "error": "Pet not found",
  "requestId": "aws-request-id"
}
```

## Rate Limits

All routes enforce per-caller rate limiting via MongoDB TTL-based counters. When exceeded, the API returns `429` with `eyeUpload.rateLimited`.

## Known Constraints

- **I20 — Race-condition duplicate creation**: The `ngoPetId` uniqueness check is application-level, not enforced by a DB unique index. A race window exists. Classified as `infra-owned`.
- **Zod 3 vs 4**: Using Zod 3.x. Upgrade to Zod 4 is a monorepo-wide concern.
- **Integration test runtime is slow under local SAM**: End-to-end EyeUpload tests commonly take ~35–45 seconds per fixture-backed request because each request starts a fresh local invocation path with Mongo + external dependency setup. The Jest fixture tests therefore use extended per-test timeouts.
