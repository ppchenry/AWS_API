# Account API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

User profile CRUD and self-service account actions. For login / register / refresh see [AUTH_FLOW_API.md](./AUTH_FLOW_API.md). For NGO admin profile editing see [NGO_ADMIN_API.md](./NGO_ADMIN_API.md).

> Global conventions (base URL, x-api-key, error shape, localization, headers) are defined in [README.md](./README.md). Only deviations are documented below.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| PUT | `/account` | Bearer JWT (self) | Update own profile |
| GET | `/account/{userId}` | Bearer JWT (self) | Read own profile |
| DELETE | `/account/{userId}` | Bearer JWT (self) | Soft-delete own account |
| POST | `/account/delete-user-with-email` | Bearer JWT (self) | Soft-delete own account by email |
| POST | `/account/update-image` | Bearer JWT (self) | Update profile image |

All endpoints enforce **self-access**: the target `userId` / `email` must match the caller's JWT claims. Mismatches return `403 common.unauthorized`.

---

### PUT /account

Update the authenticated user's profile. Email / phone uniqueness is validated against all active users.

**Lambda:** UserRoutes  
**Auth:** Bearer JWT (body `userId` must match JWT `userId`)

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `userId` | string (ObjectId) | Yes | Must match caller JWT |
| `firstName` | string | No | |
| `lastName` | string | No | |
| `email` | string | No | Valid email format |
| `phoneNumber` | string | No | Valid phone format |
| `birthday` | string | No | ISO date `YYYY-MM-DD` |
| `district` | string | No | |
| `image` | string | No | Image URL |

**Example:**

```json
{
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "firstName": "John",
  "email": "new@example.com"
}
```

**Success (200):**

```json
{
  "success": true,
  "message": "Success",
  "user": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "firstName": "John",
    "lastName": "Doe",
    "email": "new@example.com",
    "phoneNumber": "+85291234567",
    "birthday": "1990-05-10T00:00:00.000Z",
    "district": "Kowloon",
    "image": "https://...",
    "role": "user",
    "verified": true,
    "subscribe": false,
    "promotion": false,
    "deleted": false,
    "credit": 300,
    "vetCredit": 300,
    "eyeAnalysisCredit": 300,
    "bloodAnalysisCredit": 300,
    "gender": ""
  },
  "requestId": "..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.invalidPUT` | `userId` is not a valid ObjectId |
| 400 | `common.invalidDateFormat` | `birthday` invalid |
| 400 | `common.invalidEmailFormat` | `email` invalid |
| 400 | `common.invalidPhoneFormat` | `phoneNumber` invalid |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | body `userId` â‰  JWT `userId` |
| 404 | `userRoutes.errors.putUserNotFound` | User not found or deleted |
| 409 | `userRoutes.errors.emailExists` | Email used by another active user |
| 409 | `userRoutes.errors.phoneExists` | Phone used by another active user |
| 500 | `common.internalError` | Server error |

---

### GET /account/{userId}

Return the authenticated user's sanitized profile.

**Lambda:** UserRoutes  
**Auth:** Bearer JWT (path `userId` must match JWT `userId`)

**Path params:** `userId` (ObjectId)

**Success (200):** Same `user` shape as `PUT /account`, wrapped as `{ success, message: "Success", user, requestId }`.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.invalidGET` | `userId` invalid ObjectId |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Path `userId` â‰  JWT `userId` |
| 404 | `userRoutes.errors.getUserNotFound` | User not found or deleted |
| 500 | `common.internalError` | |

---

### DELETE /account/{userId}

Soft-delete the authenticated user and revoke all refresh tokens.

**Lambda:** UserRoutes  
**Auth:** Bearer JWT (self)

**Path params:** `userId` (ObjectId)

**Side effects:**
- Sets `deleted: true` on the user document
- Deletes all refresh-token records for that user

**Success (200):**

```json
{
  "success": true,
  "message": "User deleted successfully",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "requestId": "..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.invalidGET` | `userId` invalid |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | path mismatch |
| 404 | `userRoutes.errors.getUserNotFound` | User not found or already deleted |
| 500 | `common.internalError` | |

---

### POST /account/delete-user-with-email

Soft-delete the authenticated user by email (the email must match the JWT). Useful when the client only has the email on hand.

**Lambda:** UserRoutes  
**Auth:** Bearer JWT (body `email` must match JWT `userEmail`)

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | Yes | Valid email |

**Success (200):**

```json
{
  "success": true,
  "message": "deleteAccount.success",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "requestId": "..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.deleteAccount.invalidEmailFormat` | Email invalid |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | `email` â‰  JWT `userEmail` |
| 404 | `userRoutes.errors.deleteAccount.userNotFound` | No user with email |
| 409 | `userRoutes.errors.deleteAccount.userAlreadyDeleted` | Already deleted |
| 500 | `common.internalError` | |

---

### POST /account/update-image

Update the authenticated user's profile image URL.

**Lambda:** UserRoutes  
**Auth:** Bearer JWT (body `userId` must match JWT `userId`)

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `userId` | string (ObjectId) | Yes | Must match caller JWT |
| `image` | string | Yes | Must be a valid image URL |

**Success (200):**

```json
{
  "success": true,
  "message": "Image updated successfully",
  "user": { "...same shape as PUT /account response.user" },
  "requestId": "..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.updateImage.invalidUserId` | `userId` invalid |
| 400 | `userRoutes.errors.updateImage.invalidImageUrl` | Bad image URL |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | body `userId` â‰  JWT `userId` |
| 404 | `userRoutes.errors.updateImage.userNotFound` | User not found or deleted |
| 500 | `common.internalError` | |
