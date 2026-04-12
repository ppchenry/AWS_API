# API Test Report

**Last updated:** 2026-04-12

| Service | Test suite | Result |
|---|---|---|
| `UserRoutes` | `__tests__/test-userroutes.test.js` | **102 / 102 passed ✅** |
| `PetBasicInfo` | `__tests__/test-petbasicinfo.test.js` | **36 passed, 1 skipped by fixture / 37 reachable ✅** |
| **Combined** | | **138 passed + 1 optional lifecycle test skipped ✅** |

---

# Part 1 — UserRoutes

**Date:** 2026-04-11  
**Service:** `UserRoutes` Lambda (AWS SAM)  
**Test suite:** `__tests__/test-userroutes.test.js`  
**Result: 102 / 102 tests passed ✅**

---

## 1. What Was Tested

Tests were run as end-to-end integration tests against a live SAM local environment connected to the UAT MongoDB cluster (`petpetclub_uat`). Every test sent a real HTTP request and asserted on HTTP status code, response body fields, and machine-readable error keys.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
|---|---|---|
| `/account/register` | POST | 10 |
| `/account/login` | POST | 10 |
| `/account/login-2` | POST | 2 |
| `/account/{userId}` | GET | 2 |
| `/account` | PUT | 6 |
| `/account/update-password` | PUT | 4 |
| `/account/update-image` | POST | 3 |
| `/account/user-list` | GET | 4 |
| `/account/register-by-email` etc. | POST | 3 |
| `/account/register-ngo` | POST | 10 |
| `/account/login` (NGO) | POST | 1 |
| `/account/edit-ngo/{ngoId}` | GET | 5 |
| `/account/edit-ngo/{ngoId}` | PUT | 5 |
| `/account/edit-ngo/{ngoId}/pet-placement-options` | GET | 5 |
| `/account/delete-user-with-email` | POST | 6 |
| `/account/generate-sms-code` | POST | 2 |
| `/account/verify-sms-code` | POST | 3 |
| `/account/{userId}` | DELETE | 7 |
| Cross-registration duplicate protection | — | 1 |
| Security (cross-cutting) | — | 13 |
| **Total** | | **102** |

### 1.2 Test Categories

#### Happy-path flows

- User registration (email), login, profile read, profile update, password update, image update, soft-delete
- NGO registration, NGO login, NGO profile read and update, pet placement options read
- User list (paginated, with search)

#### Input validation — 400 responses

Every required field and every business rule is checked individually:

- Missing required fields (firstName, lastName, password, email/phone, code, etc.)
- Malformed JSON request bodies on both public and protected routes
- Invalid email format
- Invalid phone number format (must be E.164)
- Password shorter than 8 characters
- Invalid image URL
- Invalid date format
- Password and confirm-password mismatch (NGO registration)
- Same old and new password on password update
- Unimplemented route methods → 405

#### Business-logic errors — 4xx responses

- Duplicate email on register → 409
- Duplicate email on register with different casing → 409
- Register abuse throttling → 429
- Duplicate email on NGO register → 409
- Duplicate phone on NGO register → 409
- Duplicate business registration number on NGO register → 409
- NGO register abuse throttling → 429
- Duplicate email across regular and NGO registration flows → rejected
- Duplicate email on profile update / NGO edit → 409
- Duplicate `registrationNumber` on NGO edit → 409
- Wrong password on login → 401
- Non-existent user on login → 401
- Wrong old password on update-password → 400
- Invalid MongoDB ObjectId format for NGO → 400
- Non-existent NGO → 404
- Already-deleted user by email flow → 409
- Repeat delete on an already deleted user → 404

#### Authentication & authorisation

- No `Authorization` header → 401
- Garbage Bearer token → 401
- Expired JWT → 401
- Tampered JWT signature → 401
- `alg:none` JWT attack → 401
- Completely arbitrary Bearer string → 401
- Valid token but accessing a different user's resource → 403 (self-access enforcement) verified on all five protected mutation routes
- NGO-only routes return `401` without auth and `403` for valid non-NGO tokens
- `GET /account/user-list` returns paginated list only for NGO-role tokens → 200 (moved after NGO login in suite so `ngoToken` is populated)
- `DELETE /account/{userId}` with a non-ObjectId path param returns `403` — self-access guard fires before format validation
- Public `POST /account/login-2` route disabled → 405
- Deleted user token can no longer read the profile → 404

#### Security hardening

- **Brute-force throttling** — repeated failed login attempts are rate-limited and return `429`
- **Registration throttling** — repeated register and NGO-register attempts are rate-limited and return `429`
- **Mass assignment prevention** — extra fields (`role`, `password`, `credit`) in `PUT /account` are silently stripped by Zod; the request succeeds but the database row is unaffected
- **Registration role hardening** — regular `POST /account/register` ignores a caller-supplied `role` and still creates a standard user
- **Cross-account conflict prevention** — profile updates and NGO edit reject email conflicts against existing accounts → `409`
- **Body `userId` injection on NGO edit** — `userId` in the request body is ignored; the server always uses the JWT identity
- **NGO self-delete hardening** — `deleted` in the NGO edit request body is ignored and does not soft-delete the caller
- **NGO route authorization** — NGO-only routes are denied before handler execution unless `event.userRole === "ngo"`
- **Password redaction** — user detail and NGO detail responses do not expose password hashes
- **NoSQL injection** — passing a MongoDB operator object (`{ "$gt": "" }`) where a string is expected is rejected by Zod validation → 400

---

## 2. How Frontend Can Trace Errors

Every error response from UserRoutes follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "emailLogin.invalidUserCredential",
  "error": "使用者憑證無效",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
|---|---|---|
| `success` | `boolean` | Always `false` for errors. Safe to check as a gate. |
| `errorKey` | `string` | Machine-readable dot-notation key. Use this in `switch` / `if` to show custom UI messages or route the user. |
| `error` | `string` | Human-readable translated message in the user's language (`zh` by default, `en` with `?lang=en`). Can be displayed directly in a toast or alert. |
| `requestId` | `string` | AWS Lambda request ID. Use this to look up the full execution log in CloudWatch. Present on all errors in production. |

### Frontend Usage Pattern

```js
const res = await fetch("/account/login", { method: "POST", body: ... });
const data = await res.json();

if (!data.success) {
  // Show translated message to user
  showToast(data.error);

  // Log for internal debugging / analytics
  console.error("[API Error]", data.errorKey, "requestId:", data.requestId);

  // Route-specific handling
  if (data.errorKey === "emailLogin.invalidUserCredential") {
    highlightPasswordField();
  } else if (data.errorKey === "phoneRegister.existWithEmail") {
    showLoginInsteadPrompt();
  }
}
```

### CloudWatch Log Lookup

When a user reports an issue, the frontend should surface `requestId` (e.g. in a support page or copied to clipboard). A developer can then look it up directly:

```text
AWS Console → CloudWatch → Log Groups → /aws/lambda/UserRoutes
  → Search by requestId value
```

### Error Key Reference Table

The full list of `errorKey` values used across UserRoutes, with their default (Chinese) translations:

| errorKey | Default message (zh) |
|---|---|
| `emailLogin.invalidUserCredential` | 使用者憑證無效 |
| `emailLogin.invalidEmailFormat` | 電子郵件格式無效 |
| `emailLogin.paramsMissing` | 需要電郵和密碼 |
| `emailLogin.userNGONotFound` | 未找到 NGO 使用者存取權限 |
| `emailLogin.NGONotFound` | 未找到非政府組織 |
| `phoneRegister.existWithEmail` | 使用此電郵的使用者已存在 |
| `phoneRegister.userExist` | 用戶已存在 |
| `register.errors.firstNameRequired` | 必須提供名字 |
| `register.errors.lastNameRequired` | 必須提供姓氏 |
| `register.errors.passwordRequired` | 密碼必須至少 8 個字符 |
| `register.errors.invalidEmailFormat` | 電子郵件格式無效 |
| `register.errors.invalidPhoneFormat` | 電話號碼格式無效 |
| `register.errors.emailOrPhoneRequired` | 必須提供電子郵件或電話號碼 |
| `registerNgo.errors.firstNameRequired` | 必須提供名字 |
| `registerNgo.errors.lastNameRequired` | 必須提供姓氏 |
| `registerNgo.errors.passwordRequired` | 密碼必須至少 8 個字符 |
| `registerNgo.errors.confirmPasswordRequired` | 請確認密碼 |
| `registerNgo.errors.ngoNameRequired` | 必須提供 NGO 名稱 |
| `registerNgo.errors.businessRegRequired` | 必須提供商業登記號碼 |
| `registerNgo.errors.addressRequired` | 必須提供地址 |
| `registerNgo.errors.passwordMismatch` | 密碼與確認密碼不一致 |
| `emailRegister.invalidEmailFormat` | 電子郵件格式無效 |
| `emailRegister.invalidPhoneFormat` | 電話號碼格式無效 |
| `updatePassword.passwordUnchanged` | 新密碼不能與舊密碼相同 |
| `updatePassword.currentPasswordInvalid` | 目前密碼不正確 |
| `updatePassword.passwordLong` | 新密碼必須至少包含 8 個字符 |
| `updatePassword.invalidUserId` | 用戶 ID 格式無效 |
| `updatePassword.paramsMissing` | 必須提供舊密碼 |
| `updateImage.invalidImageUrl` | 圖片 URL 格式無效 |
| `updateImage.invalidUserId` | 用戶 ID 格式無效 |
| `others.invalidPUT` | 使用者 ID 無效或缺失 |
| `others.invalidEmailFormat` | 電子郵件格式無效 |
| `others.missingParams` | 缺少電話參數 |
| `others.unauthorized` | 需要身份驗證，請登錄 |
| `others.methodNotAllowed` | 不允許對此路徑使用該方法 |
| `others.internalError` | 發生錯誤，請稍後再試 |
| `others.rateLimited` | 請稍後再試 |
| `others.serviceUnavailable` | 服務暫時無法使用，請稍後再試 |
| `deleteAccount.userAlreadyDeleted` | 用戶已被刪除 |
| `deleteAccount.invalidEmailFormat` | 電子郵件格式無效 |
| `deleteAccount.userNotFound` | 找不到與該電子郵件地址關聯的帳戶 |
| `ngo.invalidId` | NGO ID 格式無效 |
| `ngo.notFound` | 找不到該 NGO |
| `ngo.missingId` | 必須提供 NGO ID |
| `ngo.invalidBody` | 請求內容格式無效 |
| `verification.invalidPhoneFormat` | 電話號碼格式無效 |
| `verification.missingCodeParams` | 驗證碼參數缺失 |
| `verification.codeIncorrect` | 驗證碼不正確，請重試 |
| `verification.codeExpired` | 驗證碼已過期 |

---

## 3. Security Measures Verified

| Attack | Mitigation | Verified |
|---|---|---|
| Expired / tampered JWT | `jsonwebtoken.verify()` rejects → 401 | ✅ |
| `alg:none` JWT bypass | JWT library enforces HS256 algorithm → 401 | ✅ |
| Accessing another user's data | Self-access middleware checks JWT `userId` vs path/body → 403 | ✅ |
| Malformed JSON request bodies | Guard rejects invalid JSON before route logic → 400 | ✅ |
| Mass assignment (`role`, `credit` injection) | Zod strips unknown fields silently | ✅ |
| Regular register role escalation | Service hardcodes `role: "user"` regardless of request body | ✅ |
| Repeated credential guessing | Login rate limiter throttles repeated failures → 429 | ✅ |
| Registration abuse | Register and NGO-register rate limiters throttle repeated attempts → 429 | ✅ |
| Body `userId` injection on NGO edit | Service uses `event.userId` from JWT, ignores body value | ✅ |
| NGO self-delete via edit endpoint | `deleted` is excluded from edit allowlist and schema | ✅ |
| NGO-only route privilege escalation | Guard rejects non-NGO access before route execution → 403 | ✅ |
| Password-hash leakage in responses | User-shaped responses are sanitized before returning | ✅ |
| Cross-account email reuse on update flows | User update and NGO edit reject duplicate emails → 409 | ✅ |
| Duplicate NGO registration number on edit | NGO edit rejects conflicting `registrationNumber` → 409 | ✅ |
| SMS / login abuse | Mongo-backed rate limiting throttles login and SMS send/verify flows | ✅ |
| SMS account enumeration at send step | Implementation returns a generic SMS send response; live SMS success flows were previously verified and are omitted from routine reruns to avoid recurring Twilio cost | ✅ |
| NoSQL operator injection (`{ "$gt": "" }`) | Zod type check rejects non-string values → 400 | ✅ |

---

## 4. Test Environment

| Item | Value |
|---|---|
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`) |
| Database | MongoDB Atlas UAT (`petpetclub_uat`) |
| SMS | Live SMS send/verify success flows were previously validated and confirmed working; the active suite now focuses on negative-path and validation coverage to avoid recurring Twilio cost |
| SAM command | `sam local start-api --env-vars env.json --warm-containers EAGER` |
| Run command | `npm test` (root of repo) |

---

# Part 2 — PetBasicInfo

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
|---|---|---|
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
- Token without `Bearer ` prefix → 401
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
|---|---|
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
|---|---|---|
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
|---|---|
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--testPathPattern=test-petbasicinfo --runInBand`) |
| Database | MongoDB Atlas UAT (`petpetclub_uat`) |
| SAM command | `sam local start-api --template template.yaml --env-vars env.json` |
| Run command | `npm test -- --testPathPattern=test-petbasicinfo` |
| Fixture config | `env.json PetBasicInfoFunction.TEST_PET_ID`, `TEST_OWNER_USER_ID`, `TEST_DISPOSABLE_PET_ID` |
| Latest verified run | `36 passed, 1 skipped` with no disposable fixture; the skipped delete lifecycle path was previously confirmed passing with a separate disposable fixture |
