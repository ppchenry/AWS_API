# AuthRoute API

**Base URL (Dev / AWS API Gateway):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

---

## Overview

Authentication token management API for the PetPetClub platform. Handles refresh token rotation and access token reissue using secure `HttpOnly` cookies.

### Role In The Refactored Auth Cycle

AuthRoute is the session-renewal Lambda in the current refactored auth model:

- `UserRoutes` issues the initial session for password / SMS login flows
- `EmailVerification` can bootstrap a verified session after email proof
- `AuthRoute` rotates the refresh token and returns a new short-lived access token

This Lambda does not perform primary login. It only renews an existing session that already has a valid refresh-token cookie.

### Verification Status

- Refactor status: completed modularized reference implementation
- Latest focused test result: `21 / 21` tests passed
- Test report: `dev_docs/test_reports/AUTHROUTE_TEST_REPORT.md`

### API Gateway Requirements

For the deployed API Gateway endpoint, every request must include a valid `x-api-key` header.

```http
x-api-key: <api-gateway-api-key>
```

This requirement applies to all AuthRoute endpoints. Requests that omit the header are rejected by API Gateway before Lambda logic runs, typically with `403 Forbidden`.

Local SAM testing does not enforce this gateway-level requirement.

### Authentication

AuthRoute endpoints authenticate via **refresh token cookies**, not Bearer JWTs. The refresh token is set as an `HttpOnly` cookie by the login endpoint in UserRoutes and rotated on each refresh call.

No `Authorization` header is required.

### Required Headers

#### Deployed API Gateway

```http
Content-Type: application/json
x-api-key: <api-gateway-api-key>
Cookie: refreshToken=<refresh-token>
```

The `Cookie` header is typically sent automatically by browsers and HTTP clients that store cookies from prior login responses.

#### Local SAM Testing

```http
Content-Type: application/json
Cookie: refreshToken=<refresh-token>
```

### Rate Limiting

The refresh endpoint is rate-limited per IP + token hash. Exceeding the limit returns `429`.

### Refresh Token Cookie Properties

| Property | Value |
| --- | --- |
| Name | `refreshToken` |
| HttpOnly | Yes |
| Secure | Yes |
| SameSite | Strict |
| Path | `/{stage}/auth/refresh` (e.g. `/Dev/auth/refresh`, `/Production/auth/refresh`) |
| Max-Age | 1,209,600 seconds (14 days) |

### Integration Notes

- The refresh token cookie is **scoped to the `/auth/refresh` path** for the current stage. It is not sent with requests to other endpoints.
- Each refresh call **consumes the old token** (single-use) and returns a new one via `Set-Cookie`. Clients must not retry with the old token — it will be rejected.
- The access token returned in the response body expires in **15 minutes**. Use it as `Authorization: Bearer <token>` for protected endpoints on other Lambdas.
- If the refreshed user is an NGO user, AuthRoute now preserves NGO session claims such as `ngoId` and `ngoName` so the refreshed session matches the original login contract.
- If the refresh token is missing, expired, or replayed, the client should redirect to the login flow.

### Error Response Shape

Every error returns this consistent JSON body:

```json
{
  "success": false,
  "errorKey": "authRefresh.missingRefreshToken",
  "error": "缺少 refresh token cookie",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. |
| `errorKey` | `string` | Machine-readable dot-notation key. Use in `switch`/`if` for UI logic. |
| `error` | `string` | Translated message (`zh` default, `en` with `?lang=en`). Display directly in toast/alert. |
| `requestId` | `string` | AWS Lambda request ID for CloudWatch log lookup. |

### Localization

Append `?lang=en` to any request for English error messages. Default is `zh` (Traditional Chinese).

---

## Endpoints

### POST /auth/refresh

Rotates the refresh token and issues a new short-lived access token. The old refresh token is consumed atomically — it cannot be reused.

**Auth:** Refresh token cookie (not Bearer JWT)

**Request:**

No request body is required. The refresh token is read from the `Cookie` header or the `event.cookies` array.

```http
POST /auth/refresh
Cookie: refreshToken=<current-refresh-token>
```

**Success (200):**

```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "id": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

The response also includes a `Set-Cookie` header with the new rotated refresh token.

**Response Headers:**

```http
Set-Cookie: refreshToken=<new-token>; HttpOnly; Secure; SameSite=Strict; Path=/Dev/auth/refresh; Max-Age=1209600
```

**Access Token Claims:**

The returned `accessToken` is a JWT (HS256, 15-minute expiry) containing:

| Claim | Type | Description |
| --- | --- | --- |
| `userId` | string | MongoDB ObjectId of the user |
| `userEmail` | string | User's email address |
| `userRole` | string | User's role (`user`, `ngo`, etc.) |
| `ngoId` | string | Present for NGO sessions; NGO record id preserved across refresh |
| `ngoName` | string | Present for NGO sessions; NGO display name preserved across refresh |
| `iat` | number | Issued-at timestamp |
| `exp` | number | Expiry timestamp (iat + 900) |

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 401 | `authRefresh.missingRefreshToken` | No `Cookie` header or no cookies present |
| 401 | `authRefresh.invalidRefreshTokenCookie` | Cookie header present but `refreshToken` cookie not found |
| 401 | `authRefresh.invalidSession` | Token not found in DB (consumed, expired, or replayed) |
| 401 | `authRefresh.invalidSession` | User account deleted or not found |
| 401 | `authRefresh.invalidSession` | NGO user no longer has an active NGO context or referenced NGO record |
| 429 | `others.rateLimited` | Too many refresh attempts in the current rate-limit window |
| 405 | `others.methodNotAllowed` | HTTP method other than POST or OPTIONS |
| 500 | `others.internalError` | Unexpected server error |

---

### OPTIONS /auth/refresh

CORS preflight. Handled before any authentication or DB logic.

**Success (204):** Returns CORS headers with empty body for allowed origins.

**Response Headers (allowed origin):**

```http
Access-Control-Allow-Origin: <requesting-origin>
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type,Authorization
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
```

**Error (403):** Origin not in the allowed list.

```json
{
  "error": "Origin not allowed"
}
```

---

## Complete errorKey Reference

| errorKey | HTTP | Message (en) | Message (zh) |
| --- | --- | --- | --- |
| `authRefresh.missingRefreshToken` | 401 | Missing refresh token cookie | 缺少 refresh token cookie |
| `authRefresh.invalidRefreshTokenCookie` | 401 | Invalid refresh token cookie format | refresh token cookie 格式無效 |
| `authRefresh.invalidSession` | 401 | Refresh token expired or invalid | Refresh token 已過期或無效 |
| `others.unauthorized` | 401 | Authentication required | 需要登入驗證 |
| `others.methodNotAllowed` | 405 | Method not allowed | 不支援此 HTTP 方法 |
| `others.rateLimited` | 429 | Too many requests, please try again later | 請求過於頻繁，請稍後再試 |
| `others.internalError` | 500 | An internal error occurred | 發生內部錯誤 |

---

## Frontend Usage Example

```js
async function refreshAccessToken() {
  const res = await fetch("/auth/refresh", {
    method: "POST",
    credentials: "include", // sends HttpOnly cookies
  });

  const data = await res.json();

  if (data.success) {
    // Store the new access token for Bearer auth on other endpoints
    setAccessToken(data.accessToken);
    return data.accessToken;
  }

  // Handle refresh failure
  console.error("[Auth]", data.errorKey, "requestId:", data.requestId);

  if (
    data.errorKey === "authRefresh.missingRefreshToken" ||
    data.errorKey === "authRefresh.invalidSession"
  ) {
    redirectToLogin();
  } else if (data.errorKey === "others.rateLimited") {
    showToast(data.error);
  }

  return null;
}
```
