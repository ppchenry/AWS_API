# Auth Flow API

**Base URL (Dev / AWS API Gateway):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

---

## Overview

Verification-first authentication flow for the PetPetClub platform. Users prove identity via email or SMS code **before** any account creation or login happens. There are no passwords.

### How It Works

1. **Generate code** — `POST /account/generate-email-code` or `POST /account/generate-sms-code`
2. **Verify code** — `POST /account/verify-email-code` or `POST /account/verify-sms-code`
   - **Existing user** → auto-login (returns access token + sets refresh cookie)
   - **New user** → returns `{ verified: true, isNewUser: true }` — no token, no account created
   - **Authenticated user (JWT present)** → links email/phone to the caller's account
3. **Register** (new users only) — `POST /account/register` — requires recent verification proof within 10 minutes
4. **Refresh** — `POST /auth/refresh` — rotates the refresh-token cookie and issues a new access token

```
+----------------------------------------------------------+
|  New User                                                |
|  generate code -> verify code -> { isNewUser: true }    |
|                                  |                       |
|                                  v                       |
|                        frontend collects username        |
|                                  |                       |
|                                  v                       |
|                           POST /account/register         |
|                                  |                       |
|                                  v                       |
|                        <- token + refresh cookie         |
+----------------------------------------------------------+
|  Returning User                                          |
|  generate code -> verify code -> <- token + refresh cookie |
+----------------------------------------------------------+
|  Link Email/Phone (already logged in)                    |
|  generate code -> verify code (with JWT) -> <- linked    |
+----------------------------------------------------------+
|  Refresh Access Token                                    |
|  POST /auth/refresh (cookie) -> <- new token + new cookie |
+----------------------------------------------------------+
```

---

### API Gateway Requirements

For the deployed API Gateway endpoint, every request must include a valid `x-api-key` header.

```http
x-api-key: <api-gateway-api-key>
```

This applies to all endpoints below — public and protected. Requests missing the header are rejected by API Gateway with `403 Forbidden` before Lambda logic runs.

Local SAM testing (`sam local start-api`) does not enforce this.

### Authentication

| Type | Mechanism |
| --- | --- |
| **Public endpoints** | No `Authorization` header required. JWT is optional — if present and valid, `event.userId` is populated (used by linking flow). |
| **Protected endpoints** | `Authorization: Bearer <access-token>` required. Returns `401` on missing/invalid token. |
| **Refresh endpoint** | Authenticates via `Cookie` header (refresh token). No Bearer token needed. |

Access tokens use HS256 with a 15-minute expiry.

### Required Headers

| Scenario | Headers |
| --- | --- |
| Deployed API Gateway | `Content-Type: application/json`, `x-api-key: <key>` |
| Local frontend → AWS Dev URL | `Content-Type: application/json`, `x-api-key: <key>` |
| Local SAM testing | `Content-Type: application/json` |
| Protected route | Add `Authorization: Bearer <token>` |
| Linking flow | Add `Authorization: Bearer <token>` to the verify endpoint |

### Error Response Shape

All errors return:

```json
{
  "success": false,
  "errorKey": "emailVerification.errors.verificationFailed",
  "error": "驗證失敗",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors |
| `errorKey` | `string` | Machine-readable key for UI logic and test assertions |
| `error` | `string` | Localized message string |
| `requestId` | `string` | AWS Lambda request ID for CloudWatch lookup |

### Localization

Append `?lang=en` to the URL for English error messages. Default is `zh` (Traditional Chinese). For success messages, send `lang` in the JSON body.

---

## Endpoints

### POST /account/generate-email-code

Generates a 6-digit email verification code and sends it. Anti-enumeration hardened — does not reveal whether the email belongs to an existing account.

**Lambda:** EmailVerification  
**Auth:** None (public)  
**Rate limit:** 5 requests / 300 s per email

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | Yes | Valid email address |
| `lang` | string | No | Language hint for success message |

**Example:**

```json
{ "email": "user@example.com", "lang": "en" }
```

**Success (200):**

```json
{ "success": true, "message": "Verification code sent successfully" }
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `emailVerification.errors.missingEmailParams` | Missing or empty `email` |
| 400 | `emailVerification.errors.invalidEmailFormat` | Invalid email format |
| 429 | `common.rateLimited` | Rate limit exceeded |
| 503 | `emailVerification.errors.emailServiceUnavailable` | SMTP delivery failed |
| 500 | `common.internalError` | Unexpected error |

---

### POST /account/generate-sms-code

Sends a verification code via SMS (Twilio Verify). Anti-enumeration hardened.

**Lambda:** UserRoutes  
**Auth:** None (public)  
**Rate limit:** 5 requests / 600 s per phone number

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `phoneNumber` | string | Yes | E.164 format (e.g. `+85291234567`) |

**Example:**

```json
{ "phoneNumber": "+85291234567" }
```

**Success (201):**

```json
{ "success": true, "message": "SMS code sent successfully" }
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.verification.invalidPhoneFormat` | Invalid phone number |
| 429 | `common.rateLimited` | Rate limit exceeded |
| 503 | `common.serviceUnavailable` | Twilio not configured |
| 500 | `common.internalError` | Unexpected error |

---

### POST /account/verify-email-code

Verifies a submitted 6-digit email code. Behavior depends on context:

| Context | Result |
| --- | --- |
| No JWT, email not in DB | `isNewUser: true` — frontend proceeds to register |
| No JWT, email exists in DB | Auto-login — returns access token + refresh cookie |
| Valid JWT present | Links email to the authenticated user's account |

**Lambda:** EmailVerification  
**Auth:** None required. Optional Bearer JWT triggers linking flow.  
**Rate limit:** 10 requests / 300 s per email

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | Yes | Valid email address |
| `resetCode` | string | Yes | Exactly 6 digits |
| `lang` | string | No | Language hint |

**Example:**

```json
{ "email": "user@example.com", "resetCode": "123456" }
```

**Success — New user (200):**

```json
{
  "success": true,
  "message": "Email verification successful",
  "verified": true,
  "isNewUser": true
}
```

No token, no `userId`. Frontend should collect the user's name and call `POST /account/register`.

**Success — Existing user / login (200):**

```json
{
  "success": true,
  "message": "Email verification successful",
  "verified": true,
  "isNewUser": false,
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "user",
  "isVerified": true,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Also sets `Set-Cookie` with an `HttpOnly` refresh token cookie.

**Success — Linking (200, requires JWT):**

```json
{
  "success": true,
  "message": "Email verification successful",
  "verified": true,
  "isNewUser": false,
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "user",
  "isVerified": true,
  "linked": { "email": "user@example.com" }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.missingParams` | Missing `email` or `resetCode` |
| 400 | `emailVerification.errors.invalidEmailFormat` | Invalid email format |
| 400 | `emailVerification.errors.invalidResetCodeFormat` | `resetCode` is not exactly 6 digits |
| 400 | `emailVerification.errors.verificationFailed` | Wrong code, expired, consumed, or no record |
| 401 | `common.unauthorized` | Linking: authenticated user not found or deleted |
| 409 | `userRoutes.errors.phoneRegister.existWithEmail` | Linking: email already owned by another user |
| 429 | `common.rateLimited` | Rate limit exceeded |
| 500 | `common.internalError` | Unexpected error |

---

### POST /account/verify-sms-code

Verifies a submitted SMS code via Twilio. Same 3-branch behavior as email verify.

| Context | Result |
| --- | --- |
| No JWT, phone not in DB | `isNewUser: true` — frontend proceeds to register |
| No JWT, phone exists in DB | Auto-login — returns access token + refresh cookie |
| Valid JWT present | Links phone to the authenticated user's account |

**Lambda:** UserRoutes  
**Auth:** None required. Optional Bearer JWT triggers linking flow.  
**Rate limit:** 10 requests / 600 s per phone number

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `phoneNumber` | string | Yes | E.164 format |
| `code` | string | Yes | The code received via SMS |

**Example:**

```json
{ "phoneNumber": "+85291234567", "code": "123456" }
```

**Success — New user (200):**

```json
{
  "success": true,
  "message": "Phone number verified successfully",
  "verified": true,
  "isNewUser": true
}
```

**Success — Existing user / login (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "verified": true,
  "isNewUser": false,
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "user",
  "isVerified": true,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Also sets `Set-Cookie` with refresh token cookie.

**Success — Linking (200, requires JWT):**

```json
{
  "success": true,
  "message": "Phone number verified successfully",
  "verified": true,
  "isNewUser": false,
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "user",
  "isVerified": true,
  "linked": { "phoneNumber": "+85291234567" }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.verification.invalidPhoneFormat` | Invalid phone number |
| 400 | `userRoutes.errors.verification.missingCodeParams` | Missing `code` |
| 400 | `userRoutes.errors.verification.codeIncorrect` | Wrong code (Twilio status `pending`) |
| 400 | `userRoutes.errors.verification.codeExpired` | Code expired or canceled |
| 400 | `userRoutes.errors.verification.failed` | Other non-approved Twilio status |
| 401 | `common.unauthorized` | Linking: authenticated user not found |
| 409 | `userRoutes.errors.phoneRegister.userExist` | Linking: phone already owned by another user |
| 429 | `common.rateLimited` | Rate limit exceeded |
| 503 | `common.serviceUnavailable` | Twilio not configured |
| 500 | `common.internalError` | Unexpected error |

---

### POST /account/register

Creates a new user account. Requires recent verification proof — the caller must have successfully verified an email or phone within the last 10 minutes.

**Lambda:** UserRoutes  
**Auth:** None (public)  
**Rate limit:** 12 requests / 600 s

**Verification proof:** The service checks `EmailVerificationCode` (by email) and `SmsVerificationCode` (by phone) for a record with `consumedAt` within the past 10 minutes. If neither exists, registration is rejected with `403`.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `firstName` | string | Yes | Min 1 character |
| `lastName` | string | Yes | Min 1 character |
| `email` | string | Conditional | At least one of `email` or `phoneNumber` required |
| `phoneNumber` | string | Conditional | At least one of `email` or `phoneNumber` required |
| `subscribe` | string \| boolean | No | Coerced to boolean |
| `promotion` | boolean | No | Defaults to `false` |
| `district` | string | No | Nullable |
| `image` | string | No | Must be a valid image URL if provided |
| `birthday` | string | No | Must be a valid date format if provided |
| `gender` | string | No | Nullable, defaults to `""` |

**Example:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "user@example.com"
}
```

**Success (201):**

```json
{
  "success": true,
  "message": "Registration successful",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "user",
  "isVerified": true,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Also sets `Set-Cookie` with refresh token cookie.

**New account defaults:** `role: "user"`, `verified: true`, `credit: 300`, `vetCredit: 300`, `eyeAnalysisCredit: 300`, `bloodAnalysisCredit: 300`

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.register.errors.firstNameRequired` | Missing firstName |
| 400 | `userRoutes.errors.register.errors.lastNameRequired` | Missing lastName |
| 400 | `userRoutes.errors.register.errors.emailOrPhoneRequired` | Neither email nor phone provided |
| 400 | `userRoutes.errors.register.errors.invalidEmailFormat` | Invalid email |
| 400 | `userRoutes.errors.register.errors.invalidPhoneFormat` | Invalid phone |
| 400 | `userRoutes.errors.register.errors.invalidImageUrl` | Bad image URL |
| 400 | `userRoutes.errors.register.errors.invalidBirthdayFormat` | Bad date format |
| 403 | `userRoutes.errors.register.errors.emailOrPhoneRequired` | No verification proof within 10 minutes |
| 409 | `userRoutes.errors.phoneRegister.userExist` | Phone already registered |
| 409 | `userRoutes.errors.phoneRegister.existWithEmail` | Email already registered |
| 409 | `userRoutes.errors.register.duplicate.{field}` | MongoDB duplicate key race condition (e.g. `userRoutes.errors.register.duplicate.email`) |
| 429 | `common.rateLimited` | Rate limit exceeded |
| 500 | `common.internalError` | Unexpected error |

---

### POST /auth/refresh

Rotates the refresh token and issues a new access token. The old refresh token is consumed (one-time use).

**Lambda:** AuthRoute  
**Auth:** None (authenticates via refresh-token cookie, not Bearer JWT)  
**Rate limit:** Configured via `REFRESH_RATE_LIMIT_LIMIT` / `REFRESH_RATE_LIMIT_WINDOW_SEC` environment variables

**Request:** No body. The refresh token is read from the `Cookie` header automatically.

**Example request:**

```http
POST /auth/refresh HTTP/1.1
Host: udnh87tari.execute-api.ap-southeast-1.amazonaws.com
Cookie: refreshToken=<opaque-token>
x-api-key: <api-gateway-api-key>
```

**Success (200):**

```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "id": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

Also sets `Set-Cookie` with a new rotated refresh token cookie.

**Refresh cookie contract:**

| Attribute | Value |
| --- | --- |
| `HttpOnly` | Yes |
| `Secure` | Yes |
| `SameSite` | `Strict` |
| `Path` | `/auth/refresh` (local) or `/Dev/auth/refresh` / `/Production/auth/refresh` (staged) |

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 401 | `authRoute.errors.missingRefreshToken` | No `Cookie` header present |
| 401 | `authRoute.errors.invalidRefreshTokenCookie` | `Cookie` header exists but contains no `refreshToken` |
| 401 | `authRoute.errors.invalidSession` | Token not found in DB, expired, or user deleted |
| 403 | `authRoute.errors.ngoApprovalRequired` | NGO account not active/verified |
| 429 | `common.rateLimited` | Rate limit exceeded |
| 500 | `common.internalError` | Unexpected error |

---

## Frozen (Disabled) Routes

These legacy routes are intentionally disabled and return `405 Method Not Allowed`:

| Route | Lambda |
| --- | --- |
| `POST /account/login` | UserRoutes |
| `POST /account/login-2` | UserRoutes |
| `POST /account/register-by-email` | UserRoutes |
| `POST /account/register-by-phoneNumber` | UserRoutes |
| `POST /account/register-email-2` | UserRoutes |
| `PUT /account/update-password` | UserRoutes |
| `POST /account/generate-email-code-2` | EmailVerification |

---

## Frontend Integration Guide

### New User Registration

```
1. POST /account/generate-email-code   { email }
   <- 200  (code sent)

2. POST /account/verify-email-code     { email, resetCode }
   <- 200  { verified: true, isNewUser: true }

3. Collect firstName, lastName from user

4. POST /account/register              { firstName, lastName, email }
   <- 201  { token, userId, ... }
   <- Set-Cookie: refreshToken=...
```

### Returning User Login

```
1. POST /account/generate-sms-code     { phoneNumber }
   <- 201  (code sent)

2. POST /account/verify-sms-code       { phoneNumber, code }
   <- 200  { verified: true, isNewUser: false, token, userId }
   <- Set-Cookie: refreshToken=...
```

### Link Email to Existing Account

```
1. POST /account/generate-email-code   { email }
   <- 200  (code sent)

2. POST /account/verify-email-code     { email, resetCode }
   Headers: Authorization: Bearer <access-token>
   <- 200  { verified: true, linked: { email } }
```

### Link Phone to Existing Account

```
1. POST /account/generate-sms-code     { phoneNumber }
   <- 201  (code sent)

2. POST /account/verify-sms-code       { phoneNumber, code }
   Headers: Authorization: Bearer <access-token>
   <- 200  { verified: true, linked: { phoneNumber } }
```

### Refresh Access Token

```
POST /auth/refresh
Cookie: refreshToken=<token>
<- 200  { accessToken, id }
<- Set-Cookie: refreshToken=<new-rotated-token>
```

### Token Lifecycle

- **Access token:** 15-minute expiry, HS256. Sent in `Authorization: Bearer <token>` for protected routes.
- **Refresh token:** Long-lived, `HttpOnly` cookie. Consumed on use (one-time) and replaced with a new one (rotation).
- On `401` from any protected endpoint, call `POST /auth/refresh` to get a new access token.
- If refresh also returns `401`, the session is expired — restart the verification flow.

---

## Testing

Unit tests for the verification-first auth flow:

```bash
npx jest --runInBand --testPathPattern=test-authworkflow --no-coverage
```

Integration tests (requires `sam local start-api`):

```bash
npx jest --runInBand --testPathPattern=test-emailverification --modulePathIgnorePatterns=".aws-sam" --no-coverage
```
