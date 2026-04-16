# EyeUpload Test Report

**Date:** 2026-04-16
**Service:** `EyeUpload` Lambda (AWS SAM)
**Test suite:** `__tests__/test-eyeupload.test.js`
**Command:** `npx jest --runInBand --testPathPattern=test-eyeupload --modulePathIgnorePatterns=".aws-sam" --no-coverage`
**Result:** **94 / 94 tests passed ✅**
**Duration:** `93.58 s`

This report reflects the latest full rerun after standardizing EyeUpload on Zod 4 and restoring the existing `eyeUpload.*` validation-key contract.

---

## 1. What Was Tested

Tests were executed as end-to-end integration tests against a live SAM local environment on `http://localhost:3000`, with EyeUpload connected to the UAT MongoDB cluster (`petpetclub_uat`) and the configured S3 / external ML dependencies from `env.json`.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
| --- | --- | --- |
| OPTIONS preflight (all active routes) | OPTIONS | 9 |
| JWT authentication (cross-cutting) | — | 8 |
| Dead-route dispatch | mixed | 3 |
| Guard: eye-upload path validation | POST | 1 |
| Guard + Zod: breed analysis validation | POST | 7 |
| `/pets/create-pet-basic-info-with-image` | POST | 13 |
| `/pets/updatePetImage` | POST | 14 |
| `/analysis/eye-upload/{petId}` | POST | 10 |
| `/analysis/breed` | POST | 5 |
| `/util/uploadImage` | POST | 7 |
| `/util/uploadPetBreedImage` | POST | 9 |
| Coverage gate | — | 4 |
| **Total** | | **94** |

### 1.2 Test Categories

#### Happy-path flows (verified)

- Create pet with image → `201` with new pet ID
- Update pet basic info → `200`
- Add breed image to pet → `200`
- Upload JPEG image → `200` with URL
- Upload PNG image → `200` with URL
- Upload pet breed image into allowlisted paths → `200` with URL

#### Fixture-backed ownership checks (verified)

- Stranger updates fixture pet → `403 eyeUpload.forbidden`
- Fixture owner updates fixture pet → `200`
- Stranger runs eye-upload analysis on fixture pet → `403 eyeUpload.forbidden`
- Fixture owner on eye-upload with missing input → `400 eyeUpload.missingArguments`

#### Input validation — 400 responses (verified)

- Invalid ObjectId in eye-upload path → `400 eyeUpload.invalidObjectId`
- Malformed JSON body on breed analysis → `400 others.invalidJSON`
- Empty JSON body on breed analysis → `400 others.missingParams`
- Missing or empty `species` → `400 eyeUpload.speciesRequired`
- Missing `url` → `400 eyeUpload.urlRequired`
- Invalid URL format → `400 eyeUpload.invalidUrl`
- Unknown fields rejected by strict Zod schemas across create, update, and breed routes → `400 eyeUpload.unknownField`
- Missing required `name`, `animal`, or `sex` on create → `400`
- Malformed or non-integer `removedIndices` on update → `400 eyeUpload.invalidRemovedIndices`
- Missing image and `image_url` on eye-upload → `400 eyeUpload.missingArguments`
- Unsupported image type on eye-upload → `400 eyeUpload.unsupportedFormat`
- Empty folder or disallowed folder in uploadPetBreedImage → `400 eyeUpload.invalidFolder`
- No files uploaded where required → `400 eyeUpload.noFilesUploaded`
- More than one file on `/util/uploadImage` → `400 eyeUpload.tooManyFiles`
- Invalid image content type for upload routes → `400 eyeUpload.invalidImageFormat`

#### 401 / 403 / 404 / 413 / 429 behaviour (verified)

- No auth header → `401 others.unauthorized`
- Expired / tampered / malformed / `alg:none` JWTs → `401 others.unauthorized`
- User not found on create and eye-upload routes → `404 eyeUpload.userNotFound`
- Pet not found on update and eye-upload routes → `404 eyeUpload.petNotFound`
- Ownership violations on update and eye-upload routes → `403 eyeUpload.forbidden`
- NGO authorization failures on create / update → `403 eyeUpload.ngoRoleRequired`, `403 eyeUpload.ngoIdClaimRequired`, or `403 eyeUpload.forbidden`
- Zero-byte eye-upload file → `413 eyeUpload.fileTooSmall` or, under some SAM-local multipart parsing behavior, `400 eyeUpload.missingArguments`
- All six active routes enforce Mongo-backed rate limits and return `429 eyeUpload.rateLimited`

#### Dead routes (verified)

The EyeUpload router explicitly maps these legacy routes to `405 others.methodNotAllowed`:

- `PUT /pets/updatePetEye`
- `GET /pets/gets3Image`
- `POST /pets/create-pet-basic-info`

These were validated through direct router dispatch in the test suite, not through API Gateway, because SAM / API Gateway route registration must not duplicate live handlers owned by other Lambdas.

---

## 2. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`) |
| Database | MongoDB Atlas UAT (`petpetclub_uat`) |
| SAM setup used for latest full verification | Fresh SAM local API on `http://localhost:3000` after `sam build EyeUploadFunction` |
| Full suite command | `npx jest --runInBand --testPathPattern=test-eyeupload --modulePathIgnorePatterns=".aws-sam" --no-coverage` |
| Fixture config | `env.json EyeUploadFunction`: `TEST_PET_ID`, `TEST_OWNER_USER_ID` |

### Notes

- Fixture-backed requests under local SAM can still be slow, so those tests retain extended per-test timeouts in the suite.
- The first allowed-origin preflight request may also pay a SAM-local cold-start penalty, so that single preflight test now uses a 60-second timeout to avoid false failures unrelated to application logic.

---

## 3. Security Measures Verified

| Attack | Mitigation | Test evidence |
| --- | --- | --- |
| Missing / expired / tampered JWT | `authJWT` rejects invalid tokens with HS256 pinned | ✅ Asserted |
| `alg:none` JWT bypass | Algorithm restricted to `HS256` | ✅ Asserted |
| Cross-owner pet update | `loadAuthorizedPet` enforces owner / NGO ownership | ✅ Asserted |
| Cross-owner eye analysis | `loadAuthorizedPet` enforces owner / NGO ownership | ✅ Asserted |
| Client-supplied `userId` mass-assignment | Strict schemas reject `userId` in create flow; eye analysis uses JWT identity only | ✅ Asserted |
| Unknown field mass-assignment | Schema-level allowlist validation rejects extra fields with `eyeUpload.unknownField` before DB writes | ✅ Asserted |
| Invalid JSON body | Guard rejects malformed JSON before service execution | ✅ Asserted |
| Folder traversal / arbitrary key injection | uploadPetBreedImage uses allowlisted top-level prefixes and rejects `.` / `..` segments | ✅ Asserted |
| Upload validation mismatch | `/util/uploadImage` validates the actual uploaded file and restricts requests to one file | ✅ Asserted |
| Rate-limit storage race | Mongo-backed limiter includes duplicate-key retry and was validated through integration tests | ✅ Asserted |
| Dead-route accidental exposure | Deprecated routes return explicit `405` via router instead of executing logic | ✅ Asserted |

---

## 4. Error Response Contract

All EyeUpload errors follow the standard shape:

```json
{
  "success": false,
  "errorKey": "eyeUpload.petNotFound",
  "error": "Pet not found",
  "requestId": "aws-request-id"
}
```

### Representative error keys verified by tests

| errorKey | Meaning |
| --- | --- |
| `others.unauthorized` | Missing or invalid JWT |
| `others.invalidJSON` | Malformed JSON body |
| `others.missingParams` | Empty JSON body |
| `others.methodNotAllowed` | Legacy dead route |
| `eyeUpload.invalidObjectId` | Invalid ObjectId input |
| `eyeUpload.userNotFound` | JWT user record missing or soft-deleted |
| `eyeUpload.petNotFound` | Pet record missing or soft-deleted |
| `eyeUpload.forbidden` | Ownership or authorization failure |
| `eyeUpload.missingArguments` | Missing multipart image input |
| `eyeUpload.unsupportedFormat` | Unsupported eye-analysis image type |
| `eyeUpload.invalidImageFormat` | Unsupported upload image type |
| `eyeUpload.tooManyFiles` | More than one file sent to `/util/uploadImage` |
| `eyeUpload.invalidFolder` | Invalid uploadPetBreedImage folder path |
| `eyeUpload.invalidRemovedIndices` | Malformed removedIndices payload |
| `eyeUpload.rateLimited` | Write / upload rate limit exceeded |

---

## 5. Documentation Notes

- `PUT /pets/updatePetEye` remains a dead route in the EyeUpload router and should not be mounted under `EyeUploadFunction` in the shared SAM template, because `GetAllPetsFunction` already owns that API Gateway path.
- `/util/uploadImage` currently accepts exactly one uploaded file and does not require `petId`; this report and the API reference have been aligned to the implementation.
