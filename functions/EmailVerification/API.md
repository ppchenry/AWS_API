# EmailVerification API

**Base URL (Dev / AWS API Gateway):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

---

## Overview

Email-based account verification API for the PetPetClub platform. This Lambda handles public email-code generation and post-registration email-code verification, then issues an access token and refresh-token cookie after proof of email ownership.

This flow is intentionally public. `POST /account/generate-email-code` does not require an existing user account and does not create placeholder users during code generation. `POST /account/verify-email-code` requires an existing, non-deleted user account and never creates one.

### API Gateway Requirements

For the deployed API Gateway endpoint, every request must include a valid `x-api-key` header.

```http
x-api-key: <api-gateway-api-key>
```

This requirement applies to both public and protected endpoints. Requests that omit the header are rejected by API Gateway before Lambda route logic runs, typically with `403 Forbidden`.

This document's Base URL points to the deployed AWS Dev API Gateway. If a local app or local web frontend calls that URL directly, it is still a deployed API Gateway request and must include `x-api-key`.

Local SAM testing does not enforce this gateway-level requirement unless you explicitly simulate it. The integration tests in `__tests__/test-emailverification.test.js` exercise Lambda behavior through `sam local start-api`, not API Gateway usage-plan enforcement.

### Authentication

All EmailVerification endpoints are public. No Bearer token is required to generate or verify an email code.

After successful verification, `POST /account/verify-email-code` returns:

- a short-lived JWT access token in the JSON body
- an `HttpOnly` refresh token cookie in the `Set-Cookie` header

The issued access token uses HS256 and a 15-minute expiry.

Some public endpoints are rate-limited and return `429` with `others.rateLimited` when abused.

Malformed JSON request bodies are rejected before service logic runs and return `400` with `others.invalidJSON`.

### Required Headers By Scenario

#### Deployed API Gateway

```http
Content-Type: application/json
x-api-key: <api-gateway-api-key>
```

Examples: `POST /account/generate-email-code`, `POST /account/verify-email-code`

#### Local frontend or web app calling the AWS Dev API

```http
Content-Type: application/json
x-api-key: <api-gateway-api-key>
```

Even if the frontend is running on `localhost`, requests to the AWS Dev Base URL still require `x-api-key` because API Gateway enforces it.

#### Local SAM integration testing

```http
Content-Type: application/json
```

`x-api-key` is not required for the local SAM flow used by the current integration suite.

### Integration Notes For Frontends And LLM Clients

- Always send `x-api-key` when calling the deployed API Gateway URL, including from local app or local web frontend builds.
- Treat `errorKey` as the stable machine-readable field for automation and test assertions.
- Log `requestId` on failures so CloudWatch logs can be correlated quickly.
- `POST /account/generate-email-code` is anti-enumeration hardened. A successful response does not indicate whether the email already belongs to an account.
- `POST /account/verify-email-code` returns `verificationFailed` for wrong code, expired code, consumed code, and nonexistent verification state. Do not build UX that tries to distinguish those cases.
- Successful verification requires a pre-registered, non-deleted account. On success it marks that account verified and issues a session.

### Error Response Shape

Every error returns this consistent JSON body:

```json
{
  "success": false,
  "errorKey": "verificationFailed",
  "error": "驗證失敗",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. |
| `errorKey` | `string` | Machine-readable key for UI logic and tests. |
| `error` | `string` | Localized message string. |
| `requestId` | `string` | AWS Lambda request ID for CloudWatch lookup. |

### Localization

Append `?lang=en` to a request for English error messages. Default is `zh` (Traditional Chinese).

For success responses, the current implementation reads optional `lang` from the JSON request body. In practice, clients that care about localized success messages should send the same language in both places until this contract is unified.

### CORS

Allowed origins are controlled by the `ALLOWED_ORIGINS` environment variable.

- `OPTIONS` with an allowed `Origin` returns `204` and CORS headers.
- `OPTIONS` with a disallowed or missing `Origin` returns `403`.
- Error and success responses include CORS headers only for allowed origins.

---

## Endpoints

### POST /account/generate-email-code

Generates a 6-digit email verification code, stores a hashed version in the dedicated verification collection, and sends the code by email.

This endpoint is anti-enumeration hardened:

- it does not reveal whether the email already belongs to a user
- it does not create or upsert a `User` record
- it does not return `uid` or `newUser`

If SMTP delivery fails after the verification record is written, the endpoint returns `503 emailServiceUnavailable`.

**Auth:** None

**Rate limit:** 5 requests per 300 seconds per composite key of client IP and email

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | Yes | Must be a valid email address |
| `lang` | string | No | Success-message language hint |

**Example:**

```json
{
  "email": "user@example.com",
  "lang": "en"
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Verification code sent successfully"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `others.invalidJSON` | Malformed JSON request body |
| 400 | `missingEmailParams` | Missing or empty `email` |
| 400 | `invalidEmailFormat` | Invalid email format |
| 429 | `others.rateLimited` | Too many generate attempts in the current rate-limit window |
| 503 | `emailServiceUnavailable` | SMTP delivery failed |
| 500 | `others.internalError` | Unexpected server error |

---

### POST /account/verify-email-code

Verifies a submitted 6-digit code against the dedicated verification store. On success, the code is atomically consumed, the existing user is marked verified, and auth tokens are issued.

Behavioral notes:

- verification records are keyed by normalized email
- the submitted code is compared by SHA-256 hash
- successful verification is single-use; replay attempts fail
- verification only succeeds for an existing, non-deleted account
- if an existing user is present and not deleted, it is reused and marked verified

**Auth:** None

**Rate limit:** 10 requests per 300 seconds per composite key of client IP and email

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | Yes | Must be a valid email address |
| `resetCode` | string | Yes | Must be exactly 6 digits |
| `lang` | string | No | Success-message language hint |

**Example:**

```json
{
  "email": "user@example.com",
  "resetCode": "123456",
  "lang": "en"
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Email verification successful",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "user",
  "isVerified": true,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Also sets an `HttpOnly` refresh token cookie via `Set-Cookie` header.

**Refresh cookie contract:**

- `HttpOnly`
- `Secure`
- `SameSite=Strict`
- `Path=/auth/refresh` for local/non-staged use
- `Path=/Dev/auth/refresh` or `Path=/Production/auth/refresh` when API Gateway stage is present

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `others.invalidJSON` | Malformed JSON request body |
| 400 | `missingParams` | Missing `email` or `resetCode` |
| 400 | `invalidEmailFormat` | Invalid email format |
| 400 | `invalidResetCodeFormat` | `resetCode` is not exactly 6 digits |
| 400 | `verificationFailed` | Wrong code, expired code, consumed code, deleted user, no matching verification record, or no registered account for the verified email |
| 429 | `others.rateLimited` | Too many verify attempts in the current rate-limit window |
| 500 | `others.internalError` | Unexpected server error |

---

### POST /account/generate-email-code-2

Deprecated and frozen endpoint. This route is intentionally disabled.

**Auth:** None

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `others.invalidJSON` | Malformed JSON request body |
| 400 | `missingEmailParams` | Missing or empty request body fields that fail guard/schema validation before route handling |
| 405 | `others.methodNotAllowed` | Endpoint is deprecated and disabled |

---

## Testing Reference

See `__tests__/test-emailverification.test.js` for the current integration coverage, including:

- CORS preflight behavior
- malformed JSON handling
- validation errors
- anti-enumeration behavior
- no-user-creation on generate
- create-user-after-verify behavior
- replay prevention
- expired and consumed code rejection
- refresh-cookie path contract
- real email smoke test

The current verified local command is:

```text
npx jest --runInBand --testPathPattern=test-emailverification --modulePathIgnorePatterns=".aws-sam" --no-coverage
```
