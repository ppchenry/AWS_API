# PetBasicInfo Test Report

**Date:** 2026-04-12
**Service:** `PetBasicInfo` Lambda (AWS SAM)
**Test suite:** `__tests__/test-petbasicinfo.test.js`
**Result:** `36 passed, 1 skipped` in the latest local run with only `TEST_PET_ID` + `TEST_OWNER_USER_ID` configured. The full delete lifecycle path was previously validated and passes when `TEST_DISPOSABLE_PET_ID` is configured to a separate live pet.

> **Fixture dependency:** 16 of the 37 tests are gated behind `TEST_PET_ID` + `TEST_OWNER_USER_ID` in `env.json PetBasicInfoFunction`. One additional lifecycle test requires `TEST_DISPOSABLE_PET_ID`, and that disposable pet must be different from `TEST_PET_ID`.

---

## 1. What Was Tested

Tests were run as end-to-end integration tests against a live SAM local environment connected to the UAT MongoDB cluster (`petpetclub_uat`). Every test sent a real HTTP request and asserted on HTTP status code, response body fields, and machine-readable error keys.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
| --- | --- | --- |
| `/pets/{petID}/basic-info` (OPTIONS preflight) | OPTIONS | 3 |
| JWT authentication (cross-cutting) | — | 7 |
| Pet ID format validation (cross-cutting) | — | 2 |
| `/pets/{petID}/basic-info` — ownership | GET / PUT | 2 |
| `/pets/{petID}/basic-info` | GET | 5 |
| `/pets/{petID}/basic-info` | PUT | 7 |
| `/pets/{petID}/eyeLog` | GET | 3 |
| `/pets/{petID}` | DELETE | 6 |
| Coverage gate | — | 1 |
| Unsupported methods | POST | 1 |
| **Total** | | **37** |

### 1.2 Test Categories

#### Happy-path flows

- GET pet basic info (owner token) — shape, field allowlist, CORS header, `id` placement
- PUT pet basic info — valid name update returns `200` with `message` key and top-level `id`
- GET eyeLog — returns `200` with `result` array, all records scoped to the requested `petId`
- DELETE pet — owner soft-deletes own pet; subsequent GET returns uniform `404`

#### Input validation — 400 / 404 responses

- Malformed JSON body on PUT → 400 (`petBasicInfo.errors.invalidJSON`)
- Empty PUT body → 400 (`petBasicInfo.errors.emptyUpdateBody`)
- Invalid petID format (non-ObjectId) → 400 (`petBasicInfo.errors.invalidPetIdFormat`)
- Valid-format petID absent from DB → 404 (`petBasicInfo.errors.petNotFound`)
- `weight` supplied as string instead of number → 400 (`petBasicInfo.errors.invalidWeightType`)
- Unknown field in PUT body (allowlist Zod schema with explicit custom issue) → 400 (`petBasicInfo.errors.invalidUpdateField`)
- `tagId` in PUT body (blocked governance field) → 400 (`petBasicInfo.errors.invalidUpdateField`)
- Invalid `birthday` date string → 400 (`petBasicInfo.errors.invalidBirthdayFormat`)
- Unsupported method (POST) on basic-info route → 405 (`petBasicInfo.errors.methodNotAllowed`)

#### Authentication & authorisation

- No `Authorization` header → 401 (`others.unauthorized`)
- Expired JWT → 401
- Garbage Bearer token → 401
- Token without `Bearer` prefix → 401
- Tampered JWT signature → 401
- `alg:none` JWT bypass attempt → 401
- Stranger token on another user's pet (GET) → 403
- Stranger token on another user's pet (PUT) → 403
- Stranger token on another user's pet (DELETE) → 403
- Error responses always include `success: false`, `errorKey`, `error` string, and `requestId`

#### Security hardening

- **CORS origin allowlist** — only origins matching `ALLOWED_ORIGINS` receive `200`/`204`; all others receive `403`; absent `Origin` header also returns `403`
- **`alg:none` JWT attack** — HS256 is pinned at verify time; an unsigned token is rejected → 401
- **Tampered signature** — header and payload intact but signature replaced; rejected → 401
- **Ownership enforcement** — `selfAccess` middleware compares JWT `userId` / `ngoId` against the pet document's owner fields; cross-owner access rejected → 403 on GET, PUT, and DELETE
- **Governance field write-block** — `tagId`, `ngoPetId`, `owner`, and `ngoId` are absent from the allowed update field set; any attempt to pass them is rejected as `petBasicInfo.errors.invalidUpdateField` → 400
- **Rate limiting on DELETE** — a `RateLimit` MongoDB document is checked before every delete; 10 attempts per 60-second window per `userId` are allowed; excess requests return `429 rateLimited`
- **Uniform 404** — both missing and soft-deleted pets return the same `petBasicInfo.errors.petNotFound` key; callers cannot enumerate deletion state
- **Response sanitization** — GET response strips `deleted`, `__v`, and any field outside the allowlist before returning; `_id` is promoted to top-level `id` only
- **eyeLog field-level sanitization** — only `_id`, `petId`, `image`, `result`, `eyeSide`, `createdAt`, `updatedAt` are returned per record; internal analysis fields are stripped

---

## 2. How Frontend Can Trace Errors

Every error response from PetBasicInfo follows the same fixed shape used across all services:

```json
{
  "success": false,
  "errorKey": "petBasicInfo.errors.invalidWeightType",
  "error": "體重類型無效。預期為數字",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### CloudWatch Log Lookup

```text
AWS Console → CloudWatch → Log Groups → /aws/lambda/PetBasicInfoFunction
  → Search by requestId value
```

### Error Key Reference Table

| errorKey | Default message (zh) |
| --- | --- |
| `others.unauthorized` | 未授權 |
| `others.internalError` | 內部伺服器錯誤 |
| `others.rateLimited` | 請求過於頻繁，請稍後再試。 |
| `petBasicInfo.errors.invalidJSON` | 無效的 JSON 格式 |
| `petBasicInfo.errors.petIdRequired` | 需要寵物 ID |
| `petBasicInfo.errors.invalidPetIdFormat` | 無效的寵物 ID 格式 |
| `petBasicInfo.errors.petNotFound` | 找不到寵物 |
| `petBasicInfo.errors.emptyUpdateBody` | 更新時必須提供至少一個欄位 |
| `petBasicInfo.errors.invalidUpdateField` | 此端點不允許更新其中一個或多個欄位 |
| `petBasicInfo.errors.invalidBirthdayFormat` | 生日日期格式無效。預期格式為 YYYY-MM-DD 或 DD/MM/YYYY |
| `petBasicInfo.errors.invalidReceivedDateFormat` | 接收日期格式無效。預期格式為 YYYY-MM-DD 或 DD/MM/YYYY |
| `petBasicInfo.errors.invalidsterilizationDateFormat` | 絕育日期格式無效。預期格式為 YYYY-MM-DD 或 DD/MM/YYYY |
| `petBasicInfo.errors.invalidImageUrl` | breedimage 中的圖片 URL 格式無效 |
| `petBasicInfo.errors.invalidWeightType` | 體重類型無效。預期為數字 |
| `petBasicInfo.errors.invalidOwnerContact1Type` | ownerContact1 類型無效。預期為數字 |
| `petBasicInfo.errors.invalidOwnerContact2Type` | ownerContact2 類型無效。預期為數字 |
| `petBasicInfo.errors.invalidSterilizationType` | sterilization 類型無效。預期為布林值 |
| `petBasicInfo.errors.invalidContact1ShowType` | contact1Show 類型無效。預期為布林值 |
| `petBasicInfo.errors.invalidContact2ShowType` | contact2Show 類型無效。預期為布林值 |
| `petBasicInfo.errors.invalidIsRegisteredType` | isRegistered 類型無效。預期為布林值 |
| `petBasicInfo.errors.duplicateTagId` | 重複的寵物 tagId |
| `petBasicInfo.errors.duplicateNgoPetId` | 重複的寵物 ngoPetId |
| `petBasicInfo.errors.methodNotAllowed` | 不允許的方法 |
| `petBasicInfo.errors.methodNotAllowedEyeLog` | 不允許的方法。eyeLog 端點僅支援 GET 方法 |
| `petBasicInfo.errors.methodNotAllowedDelete` | 不允許的方法。此端點僅支援 DELETE 方法 |
| `petBasicInfo.errors.petNotFoundOrDeleted` | 找不到寵物或已被刪除 |

---

## 3. Security Measures Verified

| Attack | Mitigation | Verified |
| --- | --- | --- |
| Expired / tampered JWT | `jsonwebtoken.verify()` rejects with HS256 pinned → 401 | ✅ |
| `alg:none` JWT bypass | Algorithm pinned to HS256 at verify time → 401 | ✅ |
| Token without Bearer prefix | Auth guard rejects non-Bearer Authorization header → 401 | ✅ |
| Cross-owner pet access | `selfAccess` checks JWT identity against pet owner fields → 403 | ✅ |
| CORS origin not in allowlist | CORS middleware rejects unknown / absent Origin → 403 | ✅ |
| Governance field mass-assignment (`ngoId`, `owner`) | Absent from Zod update schema; unknown fields rejected → 400 | ✅ |
| DELETE rate limiting / brute-force deletion | Mongo-backed rate limiter; 10 req / 60 s per userId → 429 | ✅ |
| Deletion state enumeration (410 differential) | Uniform 404 for both missing and soft-deleted pets | ✅ |
| Internal field leakage in GET response | Sanitizer allowlist strips `deleted`, `__v`, etc. | ✅ |
| eyeLog internal field leakage | Sanitizer allowlist restricts to 7 declared fields per record | ✅ |
| Malformed JSON body | Guard parses body before DB lookup; invalid JSON rejected → 400 | ✅ |

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--testPathPattern=test-petbasicinfo --runInBand`) |
| Database | MongoDB Atlas UAT (`petpetclub_uat`) |
| SAM command | `sam local start-api --template template.yaml --env-vars env.json` |
| Run command | `npm test -- --testPathPattern=test-petbasicinfo` |
| Fixture config | `env.json PetBasicInfoFunction.TEST_PET_ID`, `TEST_OWNER_USER_ID`, `TEST_DISPOSABLE_PET_ID` |
| Latest verified run | `36 passed, 1 skipped` with no disposable fixture; the skipped delete lifecycle path was previously confirmed passing with a separate disposable fixture |
