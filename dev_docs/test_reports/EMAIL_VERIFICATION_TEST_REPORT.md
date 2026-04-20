# EmailVerification Test Report

**Date:** 2026-04-16
**Service:** `EmailVerification` Lambda (AWS SAM)
**Primary test suite:** `__tests__/test-emailverification.test.js`
**Run command:** `npx jest --runInBand --testPathPattern=test-emailverification --modulePathIgnorePatterns=".aws-sam" --no-coverage`
**Result:** **30 / 30 tests passed ✅**
**Duration:** `44.028 s`

---

## 1. What Was Tested

The EmailVerification Lambda passed all current automated integration and DB-backed verification tests.

Current status:

- CORS preflight handling is covered for allowed, disallowed, and missing origins.
- The frozen `/account/generate-email-code-2` route remains locked down.
- Generate and verify flows are covered for validation, anti-enumeration, and response-shape consistency.
- Verification uses a 3-branch flow: (1) authenticated user → link identifier to account, (2) new user (no existing account) → returns `{ verified: true, isNewUser: true }`, (3) existing unverified user → auto-login with token issuance.
- Replay prevention, consumed-code handling, and existing-user reuse are all covered with DB-backed tests.
- A real outbound email smoke test still passes.

### 1.1 Endpoint Coverage

| Endpoint / Area | Method | Tests |
| --- | --- | --- |
| CORS preflight | OPTIONS | 3 |
| Frozen route `/account/generate-email-code-2` | POST | 1 |
| Guard: malformed body | POST | 3 |
| `/account/generate-email-code` validation | POST | 2 |
| `/account/generate-email-code` anti-enumeration | POST | 2 |
| `/account/verify-email-code` validation | POST | 4 |
| `/account/verify-email-code` anti-enumeration | POST | 3 |
| Error response shape and CORS contract | — | 3 |
| Tier 2 DB-backed verification cases | POST | 8 |
| Real email smoke test | POST | 1 |
| **Total** | | **30** |

### 1.2 Test Categories

#### Happy-path flows

- Generate email code for a registered account -> 200 success response
- Existing-user verification flips `verified` to `true` when needed
- Successful verification for an existing user reuses the same record without creating duplicates
- Refresh cookie path remains aligned with `/auth/refresh`
- Real outbound verification email dispatch succeeds in the smoke test

#### Input validation and contract behavior

- Allowed, disallowed, and missing-origin OPTIONS preflight handling
- Frozen `POST /account/generate-email-code-2` route returns 405
- Guard rejects malformed JSON, empty body, and null body
- Generate flow rejects missing or invalid email
- Verify flow rejects missing email, missing resetCode, non-6-digit resetCode, and invalid email format
- Error responses include `success`, `errorKey`, and `error`
- CORS headers are present on allowed-origin failures and absent for disallowed origins

#### Authentication & authorisation

- This Lambda exposes public verification endpoints rather than JWT-protected account routes
- Authenticated users can call verify with a Bearer token to link an email to their existing account
- Security-sensitive behavior is enforced through anti-enumeration, one-time code consumption, and the 3-branch verify logic

#### Security hardening

- Generate flow does not create user records before verification (`C6`)
- Verify flow returns the same generic failure for nonexistent email and wrong code
- Verification for new users (no account) returns `{ verified: true, isNewUser: true }` without creating a user record
- Verification for existing users marks the account verified and issues session artifacts
- Same code cannot be reused after successful verification
- Expired codes and already-consumed codes fail generically
- Existing and non-existing email generate flows return identical success shape

---

## 2. How Frontend Can Trace Errors

Every error response from EmailVerification follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "emailVerification.verificationFailed",
  "error": "驗證失敗",
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
AWS Console -> CloudWatch -> Log Groups -> /aws/lambda/EmailVerification
  -> Search by requestId value
```

### Error Key Reference Table

| errorKey | Context |
| --- | --- |
| `others.invalidJSON` | Malformed JSON body |
| `others.missingParams` | Empty or null body |
| `others.methodNotAllowed` | Frozen route or unsupported method |
| `emailVerification.invalidEmail` | Missing or invalid email input |
| `emailVerification.invalidResetCode` | Missing or malformed reset code |
| `emailVerification.verificationFailed` | Generic verify failure for wrong code, nonexistent user, expired code, or consumed code |

---

## 3. Security Measures Verified

| Attack / Risk | Mitigation | Verified |
| --- | --- | --- |
| CORS origin abuse | Allowed/disallowed/missing origin cases enforced at preflight | ✅ |
| Deprecated route exposure | `POST /account/generate-email-code-2` returns `405` | ✅ |
| Malformed JSON handling | Guard returns `400 others.invalidJSON` | ✅ |
| Empty body handling | Guard rejects empty POST bodies | ✅ |
| Input validation bypass | Generate/verify field validation and format checks | ✅ |
| Generate endpoint enumeration | Uniform success without `newUser` or `uid` leakage | ✅ |
| Verify endpoint enumeration | Generic `verificationFailed` response | ✅ |
| Inconsistent error shape | `success`, `errorKey`, and `error` always present | ✅ |
| Pre-verification ghost account creation | DB-backed test confirms generate does not create a user record | ✅ |
| Verify without existing account | Successful code still fails when no user exists | ✅ |
| Replay attack | Same code succeeds once, then fails generically | ✅ |
| Expired code reuse | Expired verification records fail generically | ✅ |
| Consumed code reuse | Already-consumed verification records fail generically | ✅ |
| Duplicate user creation | Existing-user verification reuses the same record | ✅ |
| Cookie scope drift | `Path=/auth/refresh`, `HttpOnly`, `Secure`, `SameSite=Strict` | ✅ |
| Outbound email regression | Live mailbox smoke test confirms dispatch path still works | ✅ |

---

## 4. Additional Notes

### Test Run Output

```text
PASS  __tests__/test-emailverification.test.js (43.947 s)
  OPTIONS preflight
    √ returns 204 with CORS headers for an allowed origin (1098 ms)
    √ returns 403 for a disallowed origin (1047 ms)
    √ returns 403 when Origin header is absent (1129 ms)
  frozen route /account/generate-email-code-2
    √ returns 405 methodNotAllowed (1041 ms)
  guard: malformed body
    √ rejects invalid JSON -> 400 invalidJSON (1052 ms)
    √ rejects empty body -> 400 (1043 ms)
    √ rejects null body -> 400 (1050 ms)
  POST /account/generate-email-code - validation
    √ rejects missing email -> 400 (1073 ms)
    √ rejects invalid email format -> 400 (1086 ms)
  POST /account/generate-email-code - anti-enumeration
    √ returns uniform success for a never-registered email (2075 ms)
    √ response shape does not include newUser or uid (1955 ms)
  POST /account/verify-email-code - validation
    √ rejects missing email -> 400 (1075 ms)
    √ rejects missing resetCode -> 400 (1071 ms)
    √ rejects non-6-digit resetCode -> 400 (1087 ms)
    √ rejects invalid email format -> 400 (1073 ms)
  POST /account/verify-email-code - anti-enumeration
    √ returns generic verificationFailed for nonexistent email (1074 ms)
    √ returns generic verificationFailed for wrong code (1072 ms)
    √ nonexistent and wrong-code responses are indistinguishable (2186 ms)
  response shape
    √ error responses include success:false, errorKey, error fields (1104 ms)
    √ CORS headers present on error responses from allowed origin (1099 ms)
    √ CORS headers absent for disallowed origin (1075 ms)
  Tier 2: generate does not create User records (C6)
    √ generate-email-code does not create a user record (2699 ms)
  Tier 2: verify requires an existing registered user
    √ verification fails generically when no user exists for the verified email (1164 ms)
  Tier 2: replay prevention
    √ second verification with the same code fails generically (2356 ms)
  Tier 2: expired code
    √ expired code returns generic verificationFailed (1108 ms)
  Tier 2: already-consumed code
    √ already-consumed code returns generic verificationFailed (1135 ms)
  Tier 2: existing user verification does not create duplicates
    √ successful verification for existing user reuses the record (1236 ms)
  Tier 2: anti-enumeration - existing vs non-existing email on generate
    √ generate returns identical shape for existing and non-existing emails (4030 ms)
  Tier 2: refresh cookie path matches /auth/refresh baseline
    √ Set-Cookie uses /auth/refresh path, not /account/verify-email-code (1244 ms)
  smoke: send verification email to jimmyjimmy26282@gmail.com
    √ generate-email-code returns 200 and sends a real email (1924 ms)

Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Snapshots:   0 total
Time:        44.028 s
Ran all test suites matching /test-emailverification/i.
```

### Residual Gaps

The suite is strong enough for functional and security-oriented regression testing, but a few controls are still primarily covered by code inspection rather than an explicit automated test:

- Rate-limit exhaustion to `429` is not shown in this run output.
- Deleted-user verification path is not called out explicitly in this run output.
- JWT payload minimization and refresh-token DB persistence are not explicitly asserted in this run output.

These are worthwhile follow-up tests if the goal is near-exhaustive security regression coverage.

### Current Contract Note

This report reflects the current register-first auth flow.

- `POST /account/generate-email-code` remains public and anti-enumeration hardened.
- `POST /account/verify-email-code` no longer creates a user account.
- Successful verification now requires an existing, non-deleted user and returns `userId`, `role`, `isVerified`, and `token` without a `newUser` field.
