# GetAllPets Test Report

**Date:** 2026-04-17  
**Service:** `GetAllPets` Lambda (AWS SAM)  
**Primary test suite:** `__tests__/test-getallpets.test.js`  
**Latest result:** full suite run `52 passed, 2 skipped`

All 52 non-lifecycle tests in the current 54-test file have passing evidence. The remaining 2 skipped tests are intentionally gated by the absence of `TEST_DISPOSABLE_PET_ID`.

> Fixture dependency: 16 of the 54 tests are gated behind `TEST_NGO_ID`, `TEST_OWNER_USER_ID`, and/or `TEST_PET_ID` in `env.json GetAllPetsFunction`. Two additional lifecycle tests require `TEST_DISPOSABLE_PET_ID`.

---

## 1. What Was Tested

Tests were run as end-to-end integration tests against a live SAM local environment connected to the configured MongoDB database. Each test sent a real HTTP request and asserted on HTTP status code, response body fields, and machine-readable error keys where applicable.

Current status:

- All 52 non-lifecycle tests in the current file have passing evidence
- Two lifecycle tests remain intentionally env-gated on `TEST_DISPOSABLE_PET_ID`
- Public NGO listing, self-access user listing, and write-path mutation routes are all covered
- Recent work added deterministic write-path rate-limit verification and location-based NGO search coverage

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
| --- | --- | --- |
| OPTIONS preflight (all 4 routes) | OPTIONS | 4 |
| JWT authentication (cross-cutting) | mixed | 7 |
| Error response contract (cross-cutting) | mixed | 1 |
| Guard: malformed body | POST / PUT | 4 |
| Guard: path parameter validation | GET | 2 |
| Self-access enforcement | GET | 2 |
| `/pets/deletePet` validation | POST | 5 |
| `/pets/updatePetEye` validation | PUT | 6 |
| Write-path rate limiting | POST / PUT | 2 |
| `/pets/pet-list-ngo/{ngoId}` Tier 1 | GET | 2 |
| `/pets/pet-list-ngo/{ngoId}` Tier 2 | GET | 10 |
| `/pets/pet-list/{userId}` Tier 2 | GET | 4 |
| `/pets/deletePet` ownership | POST | 1 |
| `/pets/updatePetEye` ownership | PUT | 1 |
| `/pets/deletePet` lifecycle (env-gated) | POST | 1 |
| `/pets/updatePetEye` deleted pet (env-gated) | PUT | 1 |
| Coverage gate | mixed | 1 |
| **Total** |  | **54** |

### 1.2 Verified Behaviors

#### Happy-path flows

- NGO pet list returns `200` with `pets`, `total`, `currentPage`, and `perPage`
- User pet list returns `200` with `form` and `total`
- Valid `updatePetEye` request against a nonexistent pet reaches the full pipeline and returns `404`

#### NGO search behavior

- `search=ZZZZNOEXIST99` returns `404 ngoPath.noPetsFound`
- `search=dog` returns only pets where at least one searchable field contains `dog`
- Searchable fields verified by tests: `name`, `animal`, `breed`, `ngoPetId`, `locationName`, `owner`
- A dedicated fixture-driven test confirms search by `locationName`
- Search terms are case-insensitive

#### Sort behavior

- `sortBy=createdAt&sortOrder=asc` returns monotonically ascending `createdAt`
- `sortBy=createdAt&sortOrder=desc` returns monotonically descending `createdAt`
- Unknown `sortBy` falls back to the default `updatedAt` ordering

#### Pagination behavior

- NGO page 1 and page 2 have the same `total` and disjoint pet id sets
- NGO page beyond the last page returns `404 ngoPath.noPetsFound`
- User pet list page beyond the last page returns `200` with empty `form`

#### Validation behavior

- Malformed JSON body returns `400 others.invalidJSON`
- Empty POST and PUT bodies return `400 others.missingParams`
- Invalid `ngoId` returns `400 ngoPath.invalidNgoIdFormat`
- Invalid `userId` returns `400 getPetsByUser.invalidUserIdFormat`
- Invalid or missing mutation fields return the documented `400` error keys
- Extra body fields on mutation routes are rejected by Zod `.strict()`

#### Authentication and authorization

- Missing JWT returns `401 others.unauthorized`
- Expired, tampered, malformed, and `alg:none` tokens return `401`
- NGO pet list remains public
- User pet list enforces self-access
- Delete and eye-update enforce ownership with real fixture ids

#### Rate limiting

- `POST /pets/deletePet` returns `429 others.rateLimited` on the 11th request in the same 60-second window
- `PUT /pets/updatePetEye` returns `429 others.rateLimited` on the 11th request in the same 60-second window

#### Sanitization

- NGO pet list strips `__v` and `deleted`
- User pet list strips `__v` and `deleted`

#### Lifecycle coverage still gated by fixture availability

- Owner delete then re-delete remains skipped without `TEST_DISPOSABLE_PET_ID`
- Update eye image on deleted pet remains skipped without `TEST_DISPOSABLE_PET_ID`

### 1.3 Known Untestable Or Deferred Paths

| Path | Reason |
| --- | --- |
| Router `405 others.methodNotAllowed` | API Gateway intercepts wrong-method requests before Lambda route dispatch in the integration setup |
| Delete lifecycle happy path | Requires a disposable production-safe fixture id |

---

## 2. Frontend Contract Notes

### Standard Error Shape

```json
{
  "success": false,
  "errorKey": "deleteStatus.missingPetId",
  "error": "Need pet id",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Important Nuances

- Error responses default to `zh`
- Error responses accept `?lang=en`
- Success messages do not currently switch on `?lang=en`; they depend on the Lambda event cookie language path
- OPTIONS preflight for disallowed or missing origins returns `403 {"error":"Origin not allowed"}` and does not use the standard error envelope
- NGO out-of-range pages return `404`, while user-list out-of-range pages return `200` with empty `form`

### Error Keys Observed In This Service

| errorKey | Meaning |
| --- | --- |
| `others.unauthorized` | Missing or invalid auth |
| `others.internalError` | Unhandled server error |
| `others.methodNotAllowed` | Route exists in code but wrong method reached router |
| `others.missingParams` | Empty required body |
| `others.invalidJSON` | Malformed JSON body |
| `others.rateLimited` | Fixed-window rate limit hit |
| `ngoPath.missingNgoId` | Missing NGO id |
| `ngoPath.invalidNgoIdFormat` | Invalid NGO id |
| `ngoPath.noPetsFound` | No NGO pets found for the request |
| `deleteStatus.missingPetId` | Missing pet id |
| `deleteStatus.invalidPetIdFormat` | Invalid pet id |
| `deleteStatus.petNotFound` | Pet not found |
| `deleteStatus.petAlreadyDeleted` | Pet already deleted |
| `updatePetEye.missingRequiredFields` | Missing eye update fields |
| `updatePetEye.invalidPetIdFormat` | Invalid pet id |
| `updatePetEye.invalidDateFormat` | Invalid date |
| `updatePetEye.invalidImageUrlFormat` | Invalid image URL |
| `updatePetEye.petNotFound` | Pet not found |
| `updatePetEye.petDeleted` | Pet already deleted |
| `getPetsByUser.invalidUserIdFormat` | Invalid user id |

---

## 3. Security Measures Verified

| Attack / Risk | Mitigation | Evidence |
| --- | --- | --- |
| Missing or invalid JWT | JWT verification with HS256 pinned | Asserted |
| `alg:none` bypass attempt | HS256 enforced at verify time | Asserted |
| Cross-owner user-list access | Path self-access check | Asserted |
| Cross-owner delete | Atomic ownership filter in `updateOne` | Asserted |
| Cross-owner eye update | Atomic ownership filter in `findOneAndUpdate` | Asserted |
| Malformed JSON | Guard rejects before DB access | Asserted |
| Mass-assignment through extra fields | Zod `.strict()` | Asserted |
| Regex injection through search | `escapeRegex()` before query build | Code-reviewed |
| Sort-field injection | `SORT_ALLOWLIST` fallback | Asserted |
| Mutation burst abuse | Mongo-backed fixed-window limiter | Asserted |
| Response leakage of internal fields | `sanitizePet` / `sanitizePets` | Asserted |

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js via AWS SAM Local |
| Test framework | Jest 29.7 |
| Database | Configured MongoDB database for the active environment |
| SAM command | `sam local start-api --template template.yaml --env-vars env.json --warm-containers EAGER` |
| Test command | `node .\\node_modules\\jest\\bin\\jest.js __tests__/test-getallpets.test.js --runInBand --modulePathIgnorePatterns=.aws-sam` |
| Fixture config | `env.json GetAllPetsFunction`: `TEST_NGO_ID`, `TEST_OWNER_USER_ID`, `TEST_PET_ID`, `TEST_DISPOSABLE_PET_ID` |
| Latest verified run | `52 passed, 2 skipped` |
