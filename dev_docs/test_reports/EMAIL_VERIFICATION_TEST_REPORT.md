# EmailVerification Test Report

**Date:** 2026-04-13
**Service:** `EmailVerification` Lambda (AWS SAM)
**Test suite:** `__tests__/test-emailverification.test.js`
**Command:** `npx jest --testPathPattern=test-emailverification --runInBand --verbose`
**Result:** **30 / 30 tests passed ✅**
**Duration:** `43.405 s`

---

## 1. Summary

The EmailVerification Lambda passed all current automated integration and DB-backed verification tests.

The deployed Dev API Gateway flow was also manually validated after packaging fixes:

- `POST /account/generate-email-code` succeeded against the deployed endpoint and delivered a real verification email
- `POST /account/verify-email-code` succeeded against the deployed endpoint and returned the documented JSON contract with `uid`, `newUser`, and `token`

Coverage includes:

- CORS preflight handling for allowed, disallowed, and missing origins
- Frozen route behavior for `/account/generate-email-code-2`
- Guard-layer malformed JSON and empty-body rejection
- Zod validation on both generate and verify flows
- Anti-enumeration behavior on generate and verify
- Consistent error response shape and CORS headers
- No user creation during generate (`C6`)
- User creation only after successful verification
- Replay prevention through one-time code consumption
- Existing-user reuse without duplicate user creation
- Refresh cookie path alignment with `/auth/refresh`
- Real outbound email smoke test

---

## 2. Test Run Output

```text
PASS  __tests__/test-emailverification.test.js (43.311 s)
  OPTIONS preflight
    √ returns 204 with CORS headers for an allowed origin (1098 ms)
    √ returns 403 for a disallowed origin (1047 ms)
    √ returns 403 when Origin header is absent (1129 ms)
  frozen route /account/generate-email-code-2
    √ returns 405 methodNotAllowed (1041 ms)
  guard: malformed body
    √ rejects invalid JSON → 400 invalidJSON (1052 ms)
    √ rejects empty body → 400 (1043 ms)
    √ rejects null body → 400 (1050 ms)
  POST /account/generate-email-code — validation
    √ rejects missing email → 400 (1073 ms)
    √ rejects invalid email format → 400 (1086 ms)
  POST /account/generate-email-code — anti-enumeration
    √ returns uniform success for a never-registered email (2075 ms)
    √ response shape does not include newUser or uid (1955 ms)
  POST /account/verify-email-code — validation
    √ rejects missing email → 400 (1075 ms)
    √ rejects missing resetCode → 400 (1071 ms)
    √ rejects non-6-digit resetCode → 400 (1087 ms)
    √ rejects invalid email format → 400 (1073 ms)
  POST /account/verify-email-code — anti-enumeration
    √ returns generic verificationFailed for nonexistent email (1074 ms)
    √ returns generic verificationFailed for wrong code (1072 ms)
    √ nonexistent and wrong-code responses are indistinguishable (2186 ms)
  response shape
    √ error responses include success:false, errorKey, error fields (1104 ms)
    √ CORS headers present on error responses from allowed origin (1099 ms)
    √ CORS headers absent for disallowed origin (1075 ms)
  Tier 2: generate does not create User records (C6)
    √ generate-email-code does not create a user record (2699 ms)
  Tier 2: verify creates user only after successful verification
    √ user is created only on successful verification, not before (1467 ms)
  Tier 2: replay prevention
    √ second verification with the same code fails generically (2356 ms)
  Tier 2: expired code
    √ expired code returns generic verificationFailed (1108 ms)
  Tier 2: already-consumed code
    √ already-consumed code returns generic verificationFailed (1135 ms)
  Tier 2: existing user verification does not create duplicates
    √ successful verification for existing user reuses the record (1261 ms)
  Tier 2: anti-enumeration — existing vs non-existing email on generate
    √ generate returns identical shape for existing and non-existing emails (4030 ms)
  Tier 2: refresh cookie path matches /auth/refresh baseline
    √ Set-Cookie uses /auth/refresh path, not /account/verify-email-code (1244 ms)
  smoke: send verification email to jimmyjimmy26282@gmail.com
    √ generate-email-code returns 200 and sends a real email (1924 ms)

Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Snapshots:   0 total
Time:        43.405 s
Ran all test suites matching /test-emailverification/i.
```

---

## 3. Security-Relevant Coverage

| Area | Verified by tests | Status |
| --- | --- | --- |
| CORS preflight enforcement | Allowed/disallowed/missing origin cases | ✅ |
| Deprecated route freeze | `POST /account/generate-email-code-2` returns `405` | ✅ |
| Malformed JSON handling | Guard returns `400 others.invalidJSON` | ✅ |
| Empty body rejection | Guard rejects empty POST bodies | ✅ |
| Input validation | Generate/verify field validation and format checks | ✅ |
| Anti-enumeration on generate | No `newUser` / `uid` leakage | ✅ |
| Anti-enumeration on verify | Generic `verificationFailed` response | ✅ |
| Response-shape consistency | `success`, `errorKey`, `error` present | ✅ |
| C6 no pre-verification user creation | DB-backed test checks no `users` row after generate | ✅ |
| Create-after-verify only | DB-backed test checks user absent before verify, present after | ✅ |
| Replay prevention | Same code succeeds once, then fails generically | ✅ |
| Expired code rejection | DB-backed expired-record verify test | ✅ |
| Already-consumed code rejection | DB-backed consumed-record verify test | ✅ |
| Existing-user reuse | DB-backed duplicate-prevention check | ✅ |
| Refresh cookie path baseline | `Path=/auth/refresh`, `HttpOnly`, `Secure`, `SameSite=Strict` | ✅ |
| Real email dispatch smoke | Verified against live mailbox route | ✅ |

---

## 4. Residual Gaps

The suite is strong enough for functional and security-oriented regression testing, but a few controls are still primarily covered by code inspection rather than an explicit automated test:

- Rate-limit exhaustion to `429` is not shown in this run output.
- Deleted-user verification path is not called out explicitly in this run output.
- JWT payload minimization and refresh-token DB persistence are not explicitly asserted in this run output.

These are worthwhile follow-up tests if the goal is near-exhaustive security regression coverage.

---

## 5. Deployed Integration Validation

After the automated SAM-local run, the Dev deployment was rechecked through the real API Gateway endpoint.

Observed outcomes:

- `POST /account/generate-email-code` returned success and delivered a real email to the test mailbox.
- `POST /account/verify-email-code` returned success with the documented contract:
  - `success: true`
  - `message: "Email verification successful"`
  - `uid: "69dc9185a8cba10792c47ea4"`
  - `newUser: false`
  - `token: <jwt>`

Notes:

- `newUser: false` is expected when the email already has a user record.
- Replay-prevention semantics still require the same code to fail on a second verify attempt after consumption.
- A deployment packaging issue was encountered and corrected before this validation: the Lambda artifact was missing the runtime `zod` dependency.
