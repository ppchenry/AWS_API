# UserRoutes API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

---

## Overview

User account management API for the PetPetClub platform. Handles registration, authentication, profile management, NGO operations, and SMS verification.

### Authentication

Most endpoints require a JWT Bearer token obtained from `POST /account/login` or `POST /account/verify-sms-code`. Token expiry is 1 hour.

```http
Authorization: Bearer <token>
```

Public endpoints (login, register, SMS) do not require authentication.

Some public auth and verification endpoints are rate-limited and return `429` with `others.rateLimited` when abused.

Protected endpoints enforce **self-access** — a user can only read/modify their own data. Attempting to access another user's resource returns `403`.

NGO management endpoints are additionally **role-protected**. They require a valid Bearer token whose `userRole` is `ngo`; missing or invalid auth returns `401`, and valid non-NGO tokens return `403`.

JSON body endpoints also reject malformed JSON before route logic runs and return `400` with `others.invalidJSON`.

### Error Response Shape

Every error returns this consistent JSON body:

```json
{
  "success": false,
  "errorKey": "emailLogin.invalidUserCredential",
  "error": "使用者憑證無效",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

| Field | Type | Purpose |
|---|---|---|
| `success` | `boolean` | Always `false` for errors. |
| `errorKey` | `string` | Machine-readable dot-notation key. Use in `switch`/`if` for UI logic. |
| `error` | `string` | Translated message (`zh` default, `en` with `?lang=en`). Display directly in toast/alert. |
| `requestId` | `string` | AWS Lambda request ID for CloudWatch log lookup. |

### Localization

Append `?lang=en` to any request for English error messages. Default is `zh` (Traditional Chinese).

---

## Endpoints

### Auth

#### POST /account/register

Creates a new user account. At least one of `email` or `phoneNumber` is required. Returns a JWT token and refresh token cookie.

Client-supplied `role` is ignored. Regular registration always creates `role: "user"`.

This endpoint is rate-limited and may return `429` when abused.

**Auth:** None

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | Yes | Min 1 char |
| `lastName` | string | Yes | Min 1 char |
| `email` | string | Conditional | Required if no `phoneNumber` |
| `phoneNumber` | string | Conditional | E.164 format. Required if no `email` |
| `password` | string | Yes | Min 8 chars |
| `subscribe` | boolean | No | |
| `promotion` | boolean | No | |
| `district` | string | No | |
| `image` | string | No | Valid URL |
| `birthday` | string | No | Parseable date |
| `gender` | string | No | |

**Example:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "MySecure1234!"
}
```

**Success (201):**

```json
{
  "success": true,
  "id": "665f1a2b3c4d5e6f7a8b9c0d",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "role": "user",
    "verified": false
  }
}
```

Also sets an `HttpOnly` refresh token cookie via `Set-Cookie` header.

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `register.errors.firstNameRequired` | Missing firstName |
| 400 | `register.errors.lastNameRequired` | Missing lastName |
| 400 | `register.errors.passwordRequired` | Password under 8 chars |
| 400 | `register.errors.emailOrPhoneRequired` | Neither email nor phone provided |
| 400 | `register.errors.invalidEmailFormat` | Invalid email format |
| 400 | `register.errors.invalidPhoneFormat` | Invalid phone format |
| 409 | `phoneRegister.existWithEmail` | Email already registered |
| 409 | `phoneRegister.userExist` | Phone already registered |
| 429 | `others.rateLimited` | Too many registration attempts in the current rate-limit window |

---

#### POST /account/login

Authenticates by email and password. Returns JWT access token and refresh token cookie. NGO users receive an extended payload with `ngo` and `ngoUserAccess` data.

**Auth:** None

**Body:**

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `password` | string | Yes |

**Example:**

```json
{
  "email": "john@example.com",
  "password": "MySecure1234!"
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "user",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "isVerified": true,
  "email": "john@example.com"
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `emailLogin.paramsMissing` | Missing email or password |
| 400 | `emailLogin.invalidEmailFormat` | Invalid email format |
| 400 | `others.invalidJSON` | Malformed JSON request body |
| 401 | `emailLogin.invalidUserCredential` | Wrong password or non-existent user |
| 403 | `emailLogin.userNGONotFound` | NGO user authenticated, but no active NGO access exists |
| 429 | `others.rateLimited` | Too many failed attempts in the current rate-limit window |
| 500 | `emailLogin.NGONotFound` | NGO user access exists, but referenced NGO record is missing |

---

#### POST /account/login-2

Deprecated endpoint. The public route is disabled and should not be used.

**Auth:** None

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `others.missingParams` | Empty request body |
| 405 | `others.methodNotAllowed` | Endpoint is deprecated and disabled |

---

### User

All User endpoints require `Authorization: Bearer <token>` and enforce **self-access** — the JWT userId must match the target userId.

#### GET /account/{userId}

Returns the authenticated user's profile.

Returned user payloads are sanitized and do not include `password`.

For authenticated requests, self-access is enforced before any user lookup. A path `userId` that does not match the JWT identity returns `403`, even if the target user does not exist.

**Auth:** Bearer token. Self-access enforced (JWT userId must match path userId).

**Success (200):**

```json
{
  "success": true,
  "message": "Success",
  "user": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "role": "user",
    "verified": true,
    "district": null,
    "birthday": null,
    "gender": "",
    "image": null,
    "credit": 300,
    "vetCredit": 300,
    "eyeAnalysisCredit": 300,
    "bloodAnalysisCredit": 300
  }
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.unauthorized` | Accessing another user's profile |
| 404 | `others.getUserNotFound` | User does not exist or has already been deleted |

---

#### PUT /account

Partially updates the authenticated user's profile. Only provided fields are updated. Unknown fields (e.g. `role`, `credit`) are silently stripped.

**Auth:** Bearer token. Self-access enforced (body userId must match JWT userId).

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string | Yes | Must match JWT userId |
| `firstName` | string | No | |
| `lastName` | string | No | |
| `email` | string | No | Valid email format |
| `phoneNumber` | string | No | E.164 format |
| `district` | string | No | |
| `image` | string | No | |
| `birthday` | string | No | Parseable date |

**Example:**

```json
{
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "firstName": "Updated"
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Success",
  "user": { "_id": "665f1a...", "firstName": "Updated", "..." : "..." }
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `others.invalidPUT` | Missing or invalid userId |
| 400 | `others.invalidEmailFormat` | Invalid email format |
| 400 | `others.invalidPhoneFormat` | Invalid phone format |
| 400 | `others.invalidJSON` | Malformed JSON request body |
| 403 | `others.unauthorized` | userId does not match JWT |
| 409 | `others.emailExists` | Email taken by another user |
| 409 | `others.phoneExists` | Phone taken by another user |
| 404 | `others.putUserNotFound` | User does not exist or has already been deleted |

---

#### DELETE /account/{userId}

Soft-deletes the user account and revokes all refresh tokens.

For authenticated requests, self-access is enforced before ObjectId format or existence checks. Any path `userId` that does not exactly match the JWT identity returns `403`, including malformed IDs.

**Auth:** Bearer token. Self-access enforced (JWT userId must match path userId).

**Success (200):**

```json
{
  "success": true,
  "message": "User deleted successfully",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.unauthorized` | Deleting another user |
| 404 | `others.getUserNotFound` | User does not exist or has already been deleted |

---

#### PUT /account/update-password

Changes the user's password. Requires current password for verification.

**Auth:** Bearer token. Self-access enforced (body userId must match JWT userId).

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string | Yes | Must match JWT userId |
| `oldPassword` | string | Yes | |
| `newPassword` | string | Yes | Min 8 chars |

**Example:**

```json
{
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "oldPassword": "OldPass1234!",
  "newPassword": "NewPass1234!"
}
```

**Success (200):**

```json
{ "success": true, "message": "Password updated successfully" }
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `updatePassword.passwordUnchanged` | New password same as old |
| 400 | `updatePassword.currentPasswordInvalid` | Wrong old password |
| 400 | `updatePassword.passwordLong` | New password under 8 chars |
| 400 | `updatePassword.invalidUserId` | Invalid userId format |
| 400 | `updatePassword.paramsMissing` | Missing oldPassword |
| 403 | `others.unauthorized` | userId does not match JWT |
| 404 | `updatePassword.userNotFound` | User does not exist or has already been deleted |

---

#### POST /account/update-image

Updates the user's profile image URL.

**Auth:** Bearer token. Self-access enforced (body userId must match JWT userId).

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string | Yes | Must match JWT userId |
| `image` | string | Yes | Valid URL |

**Example:**

```json
{
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "image": "https://example.com/photo.jpg"
}
```

**Success (200):**

```json
{ "success": true, "message": "Image updated successfully" }
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `updateImage.invalidImageUrl` | Invalid image URL |
| 400 | `updateImage.invalidUserId` | Missing or invalid userId |
| 403 | `others.unauthorized` | userId does not match JWT |
| 404 | `updateImage.userNotFound` | User does not exist or has already been deleted |

---

#### POST /account/delete-user-with-email

Soft-deletes a user by email and revokes all refresh tokens.

**Auth:** Bearer token. Self-access enforced (body email must match JWT user's email).

**Body:**

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |

**Example:**

```json
{ "email": "john@example.com" }
```

**Success (200):**

```json
{
  "success": true,
  "message": "deleteAccount.success",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `others.missingParams` | Missing email |
| 400 | `deleteAccount.invalidEmailFormat` | Invalid email format |
| 403 | `others.unauthorized` | Email does not match JWT |
| 404 | `deleteAccount.userNotFound` | No account with this email |
| 409 | `deleteAccount.userAlreadyDeleted` | Account already deleted |

---

### NGO

#### POST /account/register-ngo

Atomically creates a User (role: ngo), NGO, NgoUserAccess, and NgoCounters inside a MongoDB transaction.

This endpoint is rate-limited and may return `429` when abused.

**Auth:** None

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | Yes | |
| `lastName` | string | Yes | |
| `email` | string | Yes | Valid email |
| `phoneNumber` | string | Yes | E.164 format |
| `password` | string | Yes | Min 8 chars |
| `confirmPassword` | string | Yes | Must match `password` |
| `ngoName` | string | Yes | |
| `ngoPrefix` | string | Yes | Max 5 chars |
| `businessRegistrationNumber` | string | Yes | |
| `address` | string | Yes | |
| `description` | string | No | |
| `website` | string | No | |
| `subscribe` | boolean | No | |

**Example:**

```json
{
  "firstName": "Admin",
  "lastName": "User",
  "email": "admin@ngo.org",
  "phoneNumber": "+85298765432",
  "password": "NgoPass1234!",
  "confirmPassword": "NgoPass1234!",
  "ngoName": "Animal Rescue HK",
  "ngoPrefix": "ARHK",
  "businessRegistrationNumber": "BR12345678",
  "address": "123 Test Street, Hong Kong"
}
```

**Success (201):**

```json
{
  "success": true,
  "userId": "665f1a...",
  "ngoId": "686f3f...",
  "ngoUserAccessId": "687a1b...",
  "newNgoCounters": "688c2d..."
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `registerNgo.errors.firstNameRequired` | Missing firstName |
| 400 | `registerNgo.errors.lastNameRequired` | Missing lastName |
| 400 | `registerNgo.errors.passwordRequired` | Password under 8 chars |
| 400 | `registerNgo.errors.confirmPasswordRequired` | Missing confirmPassword |
| 400 | `registerNgo.errors.ngoNameRequired` | Missing ngoName |
| 400 | `registerNgo.errors.businessRegRequired` | Missing business registration |
| 400 | `registerNgo.errors.addressRequired` | Missing address |
| 400 | `registerNgo.errors.passwordMismatch` | password ≠ confirmPassword |
| 400 | `emailRegister.invalidEmailFormat` | Invalid email format |
| 400 | `emailRegister.invalidPhoneFormat` | Invalid phone format |
| 409 | `phoneRegister.userExist` | Email already registered |
| 409 | `emailRegister.existWithPhone` | Phone already registered |
| 409 | `registerNgo.duplicateBusinessReg` | Business reg number taken |
| 429 | `others.rateLimited` | Too many NGO registration attempts in the current rate-limit window |

---

#### GET /account/user-list

Paginated list of NGO user records with search.

**Auth:** Bearer token. NGO role required.

**Query Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `page` | integer | 1 | Min 1 |
| `search` | string | "" | Searches across firstName, lastName, NGO name, registrationNumber |

**Success (200):**

```json
{
  "success": true,
  "userList": [
    {
      "_id": "665f1a...",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "role": "ngo",
      "ngoName": "Test NGO",
      "ngoId": "686f3f...",
      "ngoPrefix": "TNGO",
      "sequence": "1"
    }
  ],
  "totalPages": 3,
  "totalDocs": 125
}
```

Items per page: 50.

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.unauthorized` | Caller is authenticated but not an NGO user |

---

#### GET /account/edit-ngo/{ngoId}

Returns complete NGO profile with associated user, access, and counter data.

Returned `userProfile` data is sanitized and does not include `password`.

**Auth:** Bearer token. NGO role required.

**Path:** `ngoId` — MongoDB ObjectId

**Success (200):**

```json
{
  "success": true,
  "userProfile": {
    "_id": "665f1a...",
    "firstName": "Admin",
    "email": "admin@ngo.org"
  },
  "ngoProfile": {
    "_id": "686f3f...",
    "name": "Animal Rescue HK",
    "registrationNumber": "BR12345678"
  },
  "ngoUserAccessProfile": {
    "roleInNgo": "admin"
  },
  "ngoCounters": {
    "ngoPrefix": "ARHK",
    "seq": 0
  },
  "errors": {
    "userProfile": null,
    "ngoUserAccessProfile": null,
    "ngoCounters": null
  }
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.unauthorized` | Caller is authenticated but not an NGO user |
| 400 | `ngo.invalidId` | Invalid ObjectId format |
| 404 | `ngo.notFound` | NGO not found |

---

#### PUT /account/edit-ngo/{ngoId}

Atomically updates NGO-related records within a MongoDB transaction. Uses whitelist-based field filtering — only allowed fields are applied. **Body `userId` is ignored; JWT identity is used.**

**Auth:** Bearer token. NGO role required.

**Path:** `ngoId` — MongoDB ObjectId

**Body:** All sections are optional. Only provide what you want to update.

```json
{
  "userProfile": {
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phoneNumber": "string",
    "gender": "string"
  },
  "ngoProfile": {
    "name": "string",
    "description": "string",
    "registrationNumber": "string",
    "email": "string",
    "website": "string",
    "address": {
      "street": "string",
      "city": "string",
      "state": "string",
      "zipCode": "string",
      "country": "string"
    },
    "petPlacementOptions": ["string"]
  },
  "ngoCounters": {
    "ngoPrefix": "string",
    "seq": 0
  },
  "ngoUserAccessProfile": {
    "roleInNgo": "string",
    "menuConfig": {
      "canViewPetList": true,
      "canEditPetDetails": true,
      "canManageAdoptions": true,
      "canAccessFosterLog": true,
      "canViewReports": true,
      "canManageUsers": true,
      "canManageNgoSettings": true
    }
  }
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Updated successfully",
  "updated": ["ngoProfile"]
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.unauthorized` | Caller is authenticated but not an NGO user |
| 400 | `ngo.invalidBody` | Invalid request body |
| 400 | `ngo.missingId` | Missing ngoId |
| 409 | `others.emailExists` | Email taken |
| 409 | `others.phoneExists` | Phone taken |
| 409 | `others.registrationNumberExists` | Business reg number taken |

---

#### GET /account/edit-ngo/{ngoId}/pet-placement-options

Returns pet placement options for an NGO.

**Auth:** Bearer token. NGO role required.

**Path:** `ngoId` — MongoDB ObjectId

**Success (200):**

```json
{
  "success": true,
  "petPlacementOptions": ["adoption", "foster", "sanctuary"]
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.unauthorized` | Caller is authenticated but not an NGO user |
| 400 | `ngo.invalidId` | Invalid ObjectId format |
| 404 | `ngo.notFound` | NGO not found |

---

### SMS

#### POST /account/generate-sms-code

Sends a 6-digit SMS verification code via Twilio.

The response is intentionally generic and does not reveal whether the phone belongs to an existing user.

**Auth:** None

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `phoneNumber` | string | Yes | E.164 format (e.g. `+85298765432`) |

**Success (201):**

```json
{ "success": true, "message": "SMS code sent successfully" }
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `others.missingParams` | Missing phoneNumber |
| 400 | `verification.invalidPhoneFormat` | Invalid phone format |
| 429 | `others.rateLimited` | Too many SMS send attempts in the current rate-limit window |
| 503 | `others.serviceUnavailable` | Twilio not configured |

---

#### POST /account/verify-sms-code

Verifies a 6-digit code with Twilio. For existing users, returns JWT + refresh token (same as login). For new users, returns `userId: "new user"` to signal registration flow.

**Auth:** None

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `phoneNumber` | string | Yes | E.164 format |
| `code` | string | Yes | 6-digit code |

**Success (201) — existing user:**

```json
{
  "success": true,
  "message": "Login successful",
  "userId": "665f1a...",
  "role": "user",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Success (201) — new user:**

```json
{
  "success": true,
  "message": "Registration successful",
  "userId": "new user",
  "role": "user",
  "token": ""
}
```

**Errors:**

| Status | errorKey | Cause |
|---|---|---|
| 400 | `verification.missingCodeParams` | Missing code |
| 400 | `verification.invalidPhoneFormat` | Invalid or missing phone |
| 400 | `verification.codeIncorrect` | Wrong code |
| 400 | `verification.codeExpired` | Code expired |
| 429 | `others.rateLimited` | Too many SMS verification attempts in the current rate-limit window |
| 503 | `others.serviceUnavailable` | Twilio not configured |

---

### Deprecated

These endpoints return `405` and exist only for backward compatibility.

For these POST routes, an empty body is rejected earlier by the request guard with `400` and `others.missingParams`. Integration tests send a non-empty body when asserting the deprecated `405` response.

| Method | Path | errorKey |
|---|---|---|
| POST | `/account/login-2` | `others.methodNotAllowed` |
| POST | `/account/register-by-email` | `others.methodNotAllowed` |
| POST | `/account/register-by-phoneNumber` | `others.methodNotAllowed` |
| POST | `/account/register-email-2` | `others.methodNotAllowed` |

---

## Complete errorKey Reference

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
| `others.invalidJSON` | 請求內容格式無效 |
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
