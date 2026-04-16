# GetAllPets Test Report

**Date:** 2026-04-14
**Service:** `GetAllPets` Lambda (AWS SAM)
**Primary test suite:** `__tests__/test-getallpets.test.js`
**Result:** Latest verification now spans two local runs:

- Baseline suite run: `49 passed, 2 skipped` with `TEST_NGO_ID`, `TEST_OWNER_USER_ID`, and `TEST_PET_ID` configured
- Focused rate-limit rerun: `2 passed` for the new write-path throttling tests

This means all `51` non-lifecycle tests in the current `53`-test file have passing evidence, while the `2` lifecycle tests remain env-gated on `TEST_DISPOSABLE_PET_ID`.

> **Fixture dependency:** 15 of the 53 tests are gated behind `TEST_NGO_ID`, `TEST_OWNER_USER_ID`, and/or `TEST_PET_ID` in `env.json GetAllPetsFunction`. Two additional lifecycle tests require `TEST_DISPOSABLE_PET_ID`.

---

## 1. What Was Tested

Tests were run as end-to-end integration tests against a live SAM local environment connected to the production MongoDB cluster (`petpetclub`). Every test sent a real HTTP request and asserted on HTTP status code, response body fields, and machine-readable error keys.

Current status:

- All 51 non-lifecycle tests in the current file have passing evidence.
- Two lifecycle tests remain intentionally env-gated on `TEST_DISPOSABLE_PET_ID` rather than failing noisily.
- Public NGO listing, self-access user listing, and write-path mutation routes are all covered.
- Recent work added deterministic write-path rate-limit verification for both delete and updatePetEye.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
| --- | --- | --- |
| OPTIONS preflight (all 4 routes) | OPTIONS | 4 |
| JWT authentication (cross-cutting) | — | 7 |
| Error response contract (cross-cutting) | — | 1 |
| Guard: malformed body | POST / PUT | 4 |
| Guard: path parameter validation | GET | 2 |
| Self-access enforcement | GET | 2 |
| `/pets/deletePet` — validation | POST | 5 |
| `/pets/updatePetEye` — validation | PUT | 6 |
| Write-path rate limiting | POST / PUT | 2 |
| `/pets/pet-list-ngo/{ngoId}` — Tier 1 | GET | 2 |
| `/pets/pet-list-ngo/{ngoId}` — Tier 2 (data, search, sort, page) | GET | 9 |
| `/pets/pet-list/{userId}` — Tier 2 (data) | GET | 4 |
| `/pets/deletePet` — ownership | POST | 1 |
| `/pets/updatePetEye` — ownership | PUT | 1 |
| `/pets/deletePet` — lifecycle (env-gated) | POST | 1 |
| `/pets/updatePetEye` — deleted pet (env-gated) | PUT | 1 |
| Coverage gate | — | 1 |
| **Total** | | **53** |

### 1.2 Test Categories

#### Happy-path flows (verified)

- GET NGO pet list — returns 200 with `pets` array, `total`, `currentPage`, `perPage`
- GET user pet list (owner token) — returns 200 with `form` array and `total`
- UPDATE pet eye — valid body for nonexistent pet returns 404 (proves full pipeline runs)

#### Search behaviour (verified with fixture data)

- `search=ZZZZNOEXIST99` → 404 with `ngoPath.noPetsFound` — proves empty search returns correct error
- `search=dog` → 200 — every returned pet contains "dog" (case-insensitive) in at least one of the searchable fields (`name`, `animal`, `breed`, `ngoPetId`, `owner`); filtered total is strictly less than unfiltered total

#### Sort behaviour (verified with fixture data)

- `sortBy=createdAt&sortOrder=asc` → returned `createdAt` timestamps are monotonically ascending
- `sortBy=createdAt&sortOrder=desc` → returned `createdAt` timestamps are monotonically descending
- `sortBy=INJECTED` (unknown) → returned pet IDs match the default (no `sortBy`) response exactly, proving fallback to `updatedAt` order

#### Pagination behaviour (verified with fixture data)

- Page 1 and page 2 share the same `total` but return disjoint pet ID sets
- `page=9999` → 404 with `ngoPath.noPetsFound`
- User pet list high page → 200 with empty `form` array (length 0)

#### Input validation — 400 responses (verified)

- Malformed JSON body on POST deletePet → 400 (`others.invalidJSON`)
- Malformed JSON body on PUT updatePetEye → 400 (`others.invalidJSON`)
- Empty body on POST deletePet → 400 (`others.missingParams`)
- Empty body on PUT updatePetEye → 400 (`others.missingParams`)
- Invalid ngoId format (non-ObjectId) on GET → 400 (`ngoPath.invalidNgoIdFormat`)
- Invalid userId format (non-ObjectId) on GET → 400 (`getPetsByUser.invalidUserIdFormat`)
- Missing petId on POST deletePet → 400 (`.strict()` rejects unknown keys)
- Empty petId string on POST deletePet → 400 (`deleteStatus.missingPetId`)
- Invalid petId format on POST deletePet → 400 (`deleteStatus.invalidPetIdFormat`)
- Extra fields via `.strict()` on POST deletePet → 400
- Missing required fields on PUT updatePetEye → 400 (`updatePetEye.missingRequiredFields`)
- Invalid petId format on PUT updatePetEye → 400 (`updatePetEye.invalidPetIdFormat`)
- Invalid date format on PUT updatePetEye → 400 (`updatePetEye.invalidDateFormat`)
- Invalid image URL on PUT updatePetEye → 400 (`updatePetEye.invalidImageUrlFormat`)
- Extra fields via `.strict()` on PUT updatePetEye → 400

#### Write-path rate limiting (verified)

- POST deletePet: first 10 requests within the same fixed 60-second window return the normal downstream result, and the 11th request returns 429 (`others.rateLimited`)
- PUT updatePetEye: first 10 requests within the same fixed 60-second window return the normal downstream result, and the 11th request returns 429 (`others.rateLimited`)
- The integration tests now wait for a fresh limiter window before sending the request burst so the assertions are deterministic for the Mongo-backed fixed-window counter

#### Authentication & authorisation (verified)

- No `Authorization` header → 401 (`others.unauthorized`)
- Expired JWT → 401
- Garbage Bearer token → 401
- Token without `Bearer` prefix → 401
- Tampered JWT signature → 401
- `alg:none` JWT bypass attempt → 401
- NGO pet list does NOT require JWT (public route) — returns 404, not 401
- Self-access: mismatched JWT userId vs path userId → 403
- Self-access: matching JWT userId passes → 200
- Stranger JWT on deletePet with real petId → 403
- Stranger JWT on updatePetEye with real petId → 403
- Stranger JWT on user pet list → 403

#### Data integrity & sanitization (verified)

- NGO pet list: `__v` and `deleted` fields stripped from every pet in the response
- User pet list: `__v` and `deleted` fields stripped from every pet in the response

#### Lifecycle — skipped (environment limitation)

The delete lifecycle tests require `TEST_DISPOSABLE_PET_ID` pointing to a pet document safe to soft-delete. This is not available against production data and is an **environment limitation, not a code gap**. The tests are gated behind the `disposableTest` runner and skip cleanly with a warning in CI logs.

- Owner soft-deletes own pet → 200; re-delete → 409 (`deleteStatus.petAlreadyDeleted`) — **SKIPPED**
- updatePetEye on deleted pet → 410 (`updatePetEye.petDeleted`) — **SKIPPED**

### 1.3 Known Untestable Paths

| Path | Reason |
| --- | --- |
| Router 405 (`others.methodNotAllowed`) | API Gateway intercepts wrong-method requests before the Lambda executes, returning its own 403. The router's 405 branch is unreachable at integration level. |
| Delete lifecycle happy path | No safe disposable fixture on production DB. See §1.2 Lifecycle above. |

---

## 2. How Frontend Can Trace Errors

Every error response from GetAllPets follows the same fixed shape used across all services:

```json
{
  "success": false,
  "errorKey": "deleteStatus.missingPetId",
  "error": "需要寵物身分證",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. Safe to check as a gate. |
| `errorKey` | `string` | Machine-readable dot-notation key for frontend routing. |
| `error` | `string` | Human-readable translated message (`zh` default, `en` with `?lang=en`). |
| `requestId` | `string` | AWS Lambda request ID for CloudWatch lookup. |

### CloudWatch Log Lookup

```text
AWS Console -> CloudWatch -> Log Groups -> /aws/lambda/GetAllPetsFunction
  -> Search by requestId value
```

### Error Key Reference Table

| errorKey | Default message (zh) |
| --- | --- |
| `others.unauthorized` | 需要身份驗證 |
| `others.internalError` | 內部伺服器錯誤 |
| `others.methodNotAllowed` | 不允許的方法 |
| `others.missingParams` | 缺少必要參數 |
| `others.invalidJSON` | 無效的 JSON 格式 |
| `others.rateLimited` | 請求過於頻繁，請稍後再試 |
| `ngoPath.missingNgoId` | 需要非政府組織 ID |
| `ngoPath.invalidNgoIdFormat` | 無效的非政府組織 ID 格式 |
| `ngoPath.noPetsFound` | 沒有找到寵物 |
| `deleteStatus.missingPetId` | 需要寵物身分證 |
| `deleteStatus.invalidPetIdFormat` | 無效的寵物 ID 格式 |
| `deleteStatus.petNotFound` | 未找到寵物 |
| `deleteStatus.petAlreadyDeleted` | 寵物已被刪除 |
| `deleteStatus.success` | 寵物刪除狀態更新成功 |
| `updatePetEye.missingRequiredFields` | 需要 petId、date、leftEyeImage1PublicAccessUrl 和 rightEyeImage1PublicAccessUrl |
| `updatePetEye.invalidPetIdFormat` | 無效的寵物 ID 格式 |
| `updatePetEye.invalidDateFormat` | 無效的日期格式，應為 YYYY-MM-DD 格式 |
| `updatePetEye.invalidImageUrlFormat` | 無效的圖片 URL 格式 |
| `updatePetEye.petNotFound` | 未找到寵物 |
| `updatePetEye.petDeleted` | 寵物已被刪除 |
| `getPetsByUser.invalidUserIdFormat` | 無效的用戶 ID 格式 |

---

## 3. Security Measures Verified

| Attack | Mitigation | Test evidence |
| --- | --- | --- |
| Expired / tampered JWT | `jsonwebtoken.verify()` rejects with HS256 pinned → 401 | ✅ Asserted |
| `alg:none` JWT bypass | Algorithm pinned to HS256 at verify time → 401 | ✅ Asserted |
| Token without Bearer prefix | Auth guard rejects non-Bearer Authorization header → 401 | ✅ Asserted |
| Cross-owner pet access (GET list) | `selfAccess` checks JWT userId against path userId → 403 | ✅ Asserted |
| Cross-owner delete | Atomic `updateOne` with `{ _id, userId }` compound filter → 403 | ✅ Asserted (stranger token) |
| Cross-owner eye update | Atomic `findOneAndUpdate` with compound filter → 403 | ✅ Asserted (stranger token) |
| CORS origin not in allowlist | CORS middleware rejects unknown / absent Origin → 403 | ✅ Asserted |
| Zod `.strict()` mass-assignment | Extra fields in body rejected before reaching DB → 400 | ✅ Asserted |
| Malformed JSON body | Guard parses body before routing; invalid JSON → 400 | ✅ Asserted |
| Mutation burst abuse | Mongo-backed fixed-window limiter returns 429 on the 11th write request per IP + user + action in 60 seconds | ✅ Asserted for deletePet and updatePetEye |
| Response sanitization | `sanitizePets` strips `__v` and `deleted` from all pet responses | ✅ Asserted (per-record loop) |
| Re-delete already-deleted pet | Atomic write returns 409 instead of double-delete | ⏭️ Skipped (no disposable fixture) |
| Update on deleted pet | Returns 410 with diagnostic resource-state error key | ⏭️ Skipped (no disposable fixture) |
| Path parameter injection (non-ObjectId) | Guard validates ObjectId format before DB query → 400 | ✅ Asserted |
| Sort field injection | `SORT_ALLOWLIST` Set rejects unknown `sortBy` values; falls back to `updatedAt` | ✅ Asserted (ID-level match with default) |
| Regex injection via search | `escapeRegex()` escapes special regex characters before DB query | ✅ Code review (not directly testable without injection payload that differs from escaped version) |

---

## 4. Additional Notes

### Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--testPathPattern=test-getallpets --runInBand`) |
| Database | MongoDB Atlas Production (`petpetclub`) |
| SAM command | `sam local start-api --template template.yaml --env-vars env.json --warm-containers EAGER` |
| Run command | `npm test -- --testPathPattern=test-getallpets` |
| Fixture config | `env.json GetAllPetsFunction`: `TEST_NGO_ID`, `TEST_OWNER_USER_ID`, `TEST_PET_ID`, `TEST_DISPOSABLE_PET_ID` |
| Latest verified runs | Baseline suite: `49 passed, 2 skipped`; focused write-path rate-limit rerun: `2 passed` |
