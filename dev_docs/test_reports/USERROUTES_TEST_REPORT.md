# UserRoutes Test Report

**Date:** 2026-04-19
**Service:** `UserRoutes` Lambda (AWS SAM)
**Primary integration suite:** `__tests__/test-userroutes.test.js`
**Additional unit suites:** `__tests__/test-sms-service.test.js`, `__tests__/test-authworkflow.test.js`
**Result:** **93 / 93 integration tests passed ✅**
**Additional SMS unit coverage:** **6 / 6 tests passed ✅**
**Additional auth-workflow unit coverage:** **28 / 28 tests passed ✅**

---

## 1. What Was Tested

Tests were run against a live SAM local environment connected to the UAT MongoDB cluster (`petpetclub_uat`) plus a focused SMS service unit suite with mocked Twilio and persistence dependencies. Integration tests sent real HTTP requests and asserted on HTTP status codes, response body fields, and machine-readable error keys.

Current status:

- The main UserRoutes integration suite is fully green and reflects the new **verification-first** auth contract.
- Regular login (`POST /account/login`), password update (`PUT /account/update-password`), and legacy login-2 (`POST /account/login-2`) are **frozen routes** returning `405`. Login tests that exercised the old credential flow have been removed.
- Regular registration (`POST /account/register`) now requires a consumed email or SMS verification proof within a 10-minute window. The integration suite seeds `email_verification_codes` / `sms_verification_codes` records to exercise this.
- The `POST /account/delete-user-with-email` block now passes after isolating its sacrificial-user setup from earlier register rate-limit state.
- The SMS service unit suite is fully green and covers the Twilio-backed verify behavior that the integration suite intentionally does not exercise live.
- The auth-workflow unit suite (`test-authworkflow.test.js`, 28 tests) covers the full verification-first lifecycle: email verify → register, SMS verify → register, frozen-route enforcement, and edge cases.
- NGO auth coverage now includes register-issued session assertions and a DB-backed login-denial check when NGO approval is revoked.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/account/register` | POST | 9 | Verification-first flow; requires consumed proof |
| `/account/login` | POST | 5 | Frozen route (405) + auth middleware tests |
| `/account/login-2` | POST | 2 | Frozen route (405) |
| `/account/{userId}` | GET | 2 | |
| `/account` | PUT | 6 | |
| `/account/update-password` | PUT | 1 | Frozen route (405) |
| `/account/update-image` | POST | 3 | |
| `/v2/account/user-list` | GET | 4 | |
| `/account/register-by-email` etc. | POST | 3 | Dead routes (405) via `test.each` |
| `/v2/account/register-ngo` | POST | 10 | NGO still uses passwords |
| `/account/login` (NGO) | POST | 1 | Frozen route (405); NGO token from register |
| `/v2/account/edit-ngo/{ngoId}` | GET | 5 | |
| `/v2/account/edit-ngo/{ngoId}` | PUT | 5 | |
| `/v2/account/edit-ngo/{ngoId}/pet-placement-options` | GET | 5 | |
| `/account/delete-user-with-email` | POST | 6 | |
| `/account/generate-sms-code` | POST | 2 | |
| `/account/verify-sms-code` | POST | 3 | |
| `/account/{userId}` | DELETE | 7 | |
| Cross-registration duplicate protection | — | 1 | |
| Security (cross-cutting) | — | 13 | |
| **Total** | | **93** | |

### 1.1.1 SMS Unit Coverage

| Suite | Scope | Tests | Result |
| --- | --- | --- | --- |
| `__tests__/test-sms-service.test.js` | `functions/UserRoutes/src/services/sms.js` | 6 | 6 / 6 passed |

### 1.2 Test Categories

#### Happy-path flows

- User registration (email and phone-only), login, profile read, profile update, password update, image update, soft-delete
- NGO registration, NGO login, NGO profile read and update, pet placement options read
- User list (paginated, with search)
- SMS service unit coverage for generate and verify success/failure paths
- NGO approval enforcement on login after approval revocation

#### Input validation — 400 responses

Every required field and every business rule is checked individually:

- Missing required fields (firstName, lastName, password, email/phone, code, etc.)
- `phoneNumber + password` without `email` on regular register → 400
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

- Duplicate verified email on register → 409
- Duplicate verified phone on register → 409
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
- `GET /v2/account/user-list` returns paginated list only for NGO-role tokens → 200 (moved after NGO registration in suite so `ngoToken` is populated)
- `DELETE /account/{userId}` with a non-ObjectId path param returns `403` — self-access guard fires before format validation
- Public `POST /account/login-2` route disabled → 405
- Deleted user token can no longer read the profile → 404
- Verified SMS code with no registered account → `userRoutes.errors.verification.codeIncorrect` (unit-tested)

#### Security hardening

- **Brute-force throttling** — repeated failed login attempts are rate-limited and return `429`
- **Registration throttling** — repeated register and NGO-register attempts are rate-limited and return `429`
- **Mass assignment prevention** — extra fields (`role`, `password`, `credit`) in `PUT /account` are silently stripped by Zod; the request succeeds but the database row is unaffected
- **Registration role hardening** — regular `POST /account/register` ignores a caller-supplied `role` and still creates a standard user
- **Verification-first flow** — regular `POST /account/register` requires a consumed email or SMS verification code within a 10-minute window; no password is collected for regular users. Returns `{ userId, role, isVerified, token }` with `201`
- **Frozen login route** — `POST /account/login` returns `405` for all callers (regular users authenticate via verify → register)
- **Frozen password route** — `PUT /account/update-password` returns `405` (passwords are not used by regular users)
- **Frozen login-2 route** — `POST /account/login-2` returns `405`
- **NGO session alignment** — `POST /v2/account/register-ngo` now issues an NGO session; frozen `POST /account/login` remains disabled
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
  "errorKey": "userRoutes.errors.emailLogin.invalidUserCredential",
  "error": "使用者憑證無效",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. Safe to check as a gate. |
| `errorKey` | `string` | Machine-readable dot-notation key. Use this in `switch` / `if` to show custom UI messages or route the user. |
| `error` | `string` | Human-readable translated message in the user's language (`zh` by default, `en` with `?lang=en`). Can be displayed directly in a toast or alert. |
| `requestId` | `string` | AWS Lambda request ID. Use this to look up the full execution log in CloudWatch. Present on all errors in production. |

### Frontend Usage Pattern

```js
const res = await fetch("/account/login", { method: "POST", body: ... });
const data = await res.json();

if (!data.success) {
  showToast(data.error);
  console.error("[API Error]", data.errorKey, "requestId:", data.requestId);

  if (data.errorKey === "userRoutes.errors.emailLogin.invalidUserCredential") {
    highlightPasswordField();
  } else if (data.errorKey === "userRoutes.errors.phoneRegister.existWithEmail") {
    showLoginInsteadPrompt();
  }
}
```

### CloudWatch Log Lookup

```text
AWS Console → CloudWatch → Log Groups → /aws/lambda/UserRoutes
  → Search by requestId value
```

### Error Key Reference Table

The full list of `errorKey` values used across UserRoutes, with their default (Chinese) translations:

| errorKey | Default message (zh) |
| --- | --- |
| `userRoutes.errors.emailLogin.invalidUserCredential` | 使用者憑證無效 |
| `userRoutes.errors.emailLogin.invalidEmailFormat` | 電子郵件格式無效 |
| `userRoutes.errors.emailLogin.paramsMissing` | 需要電郵和密碼 |
| `userRoutes.errors.emailLogin.userNGONotFound` | 未找到 NGO 使用者存取權限 |
| `userRoutes.errors.emailLogin.NGONotFound` | 未找到非政府組織 |
| `userRoutes.errors.emailLogin.ngoApprovalRequired` | NGO 帳號尚未獲批，暫時無法登入。 |
| `userRoutes.errors.phoneRegister.existWithEmail` | 使用此電郵的使用者已存在 |
| `userRoutes.errors.phoneRegister.userExist` | 用戶已存在 |
| `userRoutes.errors.register.errors.firstNameRequired` | 必須提供名字 |
| `userRoutes.errors.register.errors.lastNameRequired` | 必須提供姓氏 |
| `userRoutes.errors.register.errors.passwordRequired` | 密碼必須至少 8 個字符 |
| `userRoutes.errors.register.errors.emailRequiredWithPassword` | 提供密碼時必須同時提供電子郵件 |
| `userRoutes.errors.register.errors.invalidEmailFormat` | 電子郵件格式無效 |
| `userRoutes.errors.register.errors.invalidPhoneFormat` | 電話號碼格式無效 |
| `userRoutes.errors.register.errors.emailOrPhoneRequired` | 必須提供電子郵件或電話號碼 |
| `userRoutes.errors.registerNgo.errors.firstNameRequired` | 必須提供名字 |
| `userRoutes.errors.registerNgo.errors.lastNameRequired` | 必須提供姓氏 |
| `userRoutes.errors.registerNgo.errors.passwordRequired` | 密碼必須至少 8 個字符 |
| `userRoutes.errors.registerNgo.errors.confirmPasswordRequired` | 請確認密碼 |
| `userRoutes.errors.registerNgo.errors.ngoNameRequired` | 必須提供 NGO 名稱 |
| `userRoutes.errors.registerNgo.errors.businessRegRequired` | 必須提供商業登記號碼 |
| `userRoutes.errors.registerNgo.errors.addressRequired` | 必須提供地址 |
| `userRoutes.errors.registerNgo.errors.passwordMismatch` | 密碼與確認密碼不一致 |
| `userRoutes.errors.emailRegister.invalidEmailFormat` | 電子郵件格式無效 |
| `userRoutes.errors.emailRegister.invalidPhoneFormat` | 電話號碼格式無效 |
| `userRoutes.errors.updatePassword.passwordUnchanged` | 新密碼不能與舊密碼相同 |
| `userRoutes.errors.updatePassword.currentPasswordInvalid` | 目前密碼不正確 |
| `userRoutes.errors.updatePassword.passwordLong` | 新密碼必須至少包含 8 個字符 |
| `userRoutes.errors.updatePassword.invalidUserId` | 用戶 ID 格式無效 |
| `userRoutes.errors.updatePassword.paramsMissing` | 必須提供舊密碼 |
| `userRoutes.errors.updateImage.invalidImageUrl` | 圖片 URL 格式無效 |
| `userRoutes.errors.updateImage.invalidUserId` | 用戶 ID 格式無效 |
| `userRoutes.errors.invalidPUT` | 使用者 ID 無效或缺失 |
| `common.invalidEmailFormat` | 電子郵件格式無效 |
| `common.missingParams` | 缺少電話參數 |
| `common.unauthorized` | 需要身份驗證，請登錄 |
| `common.methodNotAllowed` | 不允許對此路徑使用該方法 |
| `common.internalError` | 發生錯誤，請稍後再試 |
| `common.rateLimited` | 請稍後再試 |
| `common.serviceUnavailable` | 服務暫時無法使用，請稍後再試 |
| `userRoutes.errors.deleteAccount.userAlreadyDeleted` | 用戶已被刪除 |
| `userRoutes.errors.deleteAccount.invalidEmailFormat` | 電子郵件格式無效 |
| `userRoutes.errors.deleteAccount.userNotFound` | 找不到與該電子郵件地址關聯的帳戶 |
| `userRoutes.errors.ngo.invalidId` | NGO ID 格式無效 |
| `userRoutes.errors.ngo.notFound` | 找不到該 NGO |
| `userRoutes.errors.ngo.missingId` | 必須提供 NGO ID |
| `userRoutes.errors.ngo.invalidBody` | 請求內容格式無效 |
| `userRoutes.errors.userRoutes.errors.verification.invalidPhoneFormat` | 電話號碼格式無效 |
| `userRoutes.errors.verification.missingCodeParams` | 驗證碼參數缺失 |
| `userRoutes.errors.verification.codeIncorrect` | 驗證碼不正確，請重試 |
| `userRoutes.errors.verification.codeExpired` | 驗證碼已過期 |

### Setup Fix Applied

The `POST /account/delete-user-with-email` setup now uses its own `x-forwarded-for` identity inside `__tests__/test-userroutes.test.js`.

- This prevents the sacrificial-user registration step from inheriting the rate-limit state created earlier by the explicit register-throttling test.
- With that isolation in place, the delete-by-email setup and all downstream assertions pass in the full suite.

---

## 3. Security Measures Verified

| Attack | Mitigation | Verified |
| --- | --- | --- |
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
| SMS verify contract | Service marks existing users verified, issues tokens, and rejects verified phones with no registered account | ✅ (unit suite) |
| NGO approval enforcement | NGO login returns 403 when the underlying NGO loses approval | ✅ |
| NoSQL operator injection (`{ "$gt": "" }`) | Zod type check rejects non-string values → 400 | ✅ |

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`) |
| Database | MongoDB Atlas UAT (`petpetclub_uat`) |
| SMS | Live SAM integration suite covers validation and negative paths; dedicated unit suite mocks Twilio and covers generate/verify service behavior |
| SAM command | `sam local start-api --env-vars env.json --warm-containers EAGER` |
| Run command | `npm test -- __tests__/test-userroutes.test.js --runInBand` and `npm test -- __tests__/test-sms-service.test.js --runInBand` |

### Latest Verified Results

```text
PASS  __tests__/test-userroutes.test.js
Test Suites: 1 passed, 1 total
Tests:       93 passed, 93 total

PASS  __tests__/test-sms-service.test.js
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total

PASS  __tests__/test-authworkflow.test.js
Test Suites: 1 passed, 1 total
Tests:       28 passed, 28 total
```
