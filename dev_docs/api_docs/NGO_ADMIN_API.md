# NGO Admin API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Endpoints for NGO account registration and NGO admin management. All protected endpoints here require the caller's JWT `role` to be `ngo` (returns `403 common.unauthorized` otherwise).

> See [README.md](./README.md) for global conventions.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/v2/account/register-ngo` | Public | Register an NGO + admin user |
| GET | `/v2/account/user-list` | Bearer JWT (ngo role) | List NGO staff users |
| GET | `/v2/account/edit-ngo/{ngoId}` | Bearer JWT (ngo role) | Read full NGO profile |
| PUT | `/v2/account/edit-ngo/{ngoId}` | Bearer JWT (ngo role) | Update NGO profile (transactional) |
| GET | `/v2/account/edit-ngo/{ngoId}/pet-placement-options` | Bearer JWT (ngo role) | List configured pet placement options |

---

### POST /v2/account/register-ngo

Creates an NGO admin user, the NGO profile, an NGO access record, and an NGO counter in one atomic transaction. On success, issues an access token and refresh cookie just like normal registration.

**Lambda:** UserRoutes  
**Auth:** None (public)  
**Rate limit:** 8 requests / 10 minutes per IP

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `firstName` | string | Yes | Min 1 |
| `lastName` | string | Yes | Min 1 |
| `email` | string | Yes | Valid email, unique |
| `phoneNumber` | string | Yes | Valid phone, unique |
| `password` | string | Yes | Min 8 chars |
| `confirmPassword` | string | Yes | Must match `password` |
| `ngoName` | string | Yes | Min 1 |
| `ngoPrefix` | string | Yes | 1–5 chars (used for pet ID prefixes) |
| `businessRegistrationNumber` | string | Yes | Unique across NGOs |
| `address` | string | Yes | Min 1 |
| `description` | string | No | Nullable |
| `website` | string | No | Nullable |
| `subscribe` | string \| boolean | No | Coerced to boolean |

**Success (201):**

```json
{
  "success": true,
  "message": "NGO registration successful",
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",
  "role": "ngo",
  "isVerified": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "ngoId": "665f1a2b3c4d5e6f7a8b9c0e",
  "ngoUserAccessId": "665f1a2b3c4d5e6f7a8b9c0f",
  "newNgoCounters": "665f1a2b3c4d5e6f7a8b9c10",
  "requestId": "..."
}
```

Also sets `Set-Cookie: refreshToken=<token>` (HttpOnly, Secure, SameSite=Strict).

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.registerNgo.errors.firstNameRequired` | Missing firstName |
| 400 | `userRoutes.errors.registerNgo.errors.lastNameRequired` | Missing lastName |
| 400 | `userRoutes.errors.emailRegister.invalidEmailFormat` | Bad email |
| 400 | `userRoutes.errors.emailRegister.invalidPhoneFormat` | Bad phone |
| 400 | `userRoutes.errors.registerNgo.errors.passwordRequired` | Missing / too short password |
| 400 | `userRoutes.errors.registerNgo.errors.confirmPasswordRequired` | Missing confirmPassword |
| 400 | `userRoutes.errors.registerNgo.errors.passwordMismatch` | password ≠ confirmPassword |
| 400 | `userRoutes.errors.registerNgo.errors.ngoNameRequired` | Missing ngoName |
| 400 | `userRoutes.errors.registerNgo.errors.ngoPrefixTooLong` | ngoPrefix > 5 chars |
| 400 | `userRoutes.errors.registerNgo.errors.businessRegRequired` | Missing BR number |
| 400 | `userRoutes.errors.registerNgo.errors.addressRequired` | Missing address |
| 409 | `userRoutes.errors.phoneRegister.userExist` | Email already registered |
| 409 | `userRoutes.errors.emailRegister.existWithPhone` | Phone already registered |
| 409 | `userRoutes.errors.registerNgo.duplicateBusinessReg` | BR number already used |
| 429 | `common.rateLimited` | 8 / 10min limit exceeded |
| 500 | `common.internalError` | Server error |

---

### GET /v2/account/user-list

List users managed by the caller's NGO. Paginated and searchable.

**Lambda:** UserRoutes  
**Auth:** Bearer JWT; role must be `ngo`

**Query params:**

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `search` | string | No | Case-insensitive match on first/last name or email |
| `page` | number | No | 1-indexed; default `1` |

**Success (200):**

```json
{
  "success": true,
  "userList": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0d",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "role": "ngo",
      "ngoName": "Helping Paws",
      "ngoId": "665f1a2b3c4d5e6f7a8b9c0e",
      "ngoPrefix": "HP",
      "sequence": "00042"
    }
  ],
  "totalPages": 3,
  "totalDocs": 120,
  "requestId": "..."
}
```

Page size: **50** users per page.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Role is not `ngo` |
| 500 | `common.internalError` | |

---

### GET /v2/account/edit-ngo/{ngoId}

Return the NGO profile, linked admin user profile, access record, and counters.

**Lambda:** UserRoutes  
**Auth:** Bearer JWT; role must be `ngo`

**Path params:** `ngoId` (ObjectId)

**Success (200):**

```json
{
  "success": true,
  "userProfile": { "...sanitized user object (see ACCOUNT_API.md)" },
  "ngoProfile": {
    "_id": "...",
    "name": "Helping Paws",
    "description": "...",
    "email": "contact@hp.org",
    "phone": "+852...",
    "website": "https://...",
    "address": { "street": "...", "city": "...", "state": "...", "zipCode": "...", "country": "..." },
    "registrationNumber": "BR12345",
    "establishedDate": "2020-01-15T00:00:00.000Z",
    "categories": [],
    "role": "ngo",
    "isVerified": true,
    "petPlacementOptions": ["foster", "adoption"]
  },
  "ngoUserAccessProfile": {
    "_id": "...",
    "ngoId": "...",
    "userId": "...",
    "roleInNgo": "admin",
    "assignedPetIds": [],
    "menuConfig": { "canViewPetList": true, "canEditPetDetails": true, "...": true },
    "isActive": true
  },
  "ngoCounters": {
    "_id": "...",
    "ngoId": "...",
    "counterType": "petSerial",
    "ngoPrefix": "HP",
    "seq": 42
  },
  "errors": {
    "userProfile": null,
    "ngoUserAccessProfile": null,
    "ngoCounters": null
  },
  "requestId": "..."
}
```

Per-section `errors` string is set when a sub-lookup fails but the root NGO record still exists.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.ngo.invalidId` | `ngoId` invalid ObjectId |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Role ≠ `ngo` |
| 404 | `userRoutes.errors.ngo.notFound` | NGO not found |
| 500 | `common.internalError` | |

---

### PUT /v2/account/edit-ngo/{ngoId}

Update any combination of the NGO's admin user, NGO profile, access record, and counters **in a single MongoDB transaction** (all-or-nothing).

**Lambda:** UserRoutes  
**Auth:** Bearer JWT; role must be `ngo`

**Path params:** `ngoId` (ObjectId)

**Body** (all sections optional; only allowlisted fields below are applied — other fields are silently ignored):

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
    "address": { "street": "string", "city": "string", "state": "string", "zipCode": "string", "country": "string" },
    "petPlacementOptions": ["string"]
  },
  "ngoCounters": { "ngoPrefix": "string", "seq": 0 },
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

Uniqueness checks: `email`, `phoneNumber`, `registrationNumber` must not collide with other active users / NGOs.

**Success (200):**

```json
{
  "success": true,
  "message": "Updated successfully",
  "updated": ["userProfile", "ngoProfile"],
  "data": {
    "userProfile": { "...": "..." },
    "ngoProfile": { "...": "..." },
    "ngoCounters": { "...": "..." },
    "ngoUserAccessProfile": { "...": "..." }
  },
  "requestId": "..."
}
```

On any sub-update failure, the entire transaction is rolled back and a `500` is returned.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.ngo.missingId` | ngoId missing |
| 400 | `userRoutes.errors.ngo.invalidId` | ngoId invalid ObjectId |
| 400 | `userRoutes.errors.ngo.invalidBody` | Body failed Zod / Mongoose validation |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Role ≠ `ngo` |
| 404 | `userRoutes.errors.ngo.notFound` | NGO not found |
| 409 | `userRoutes.errors.emailExists` | Email used elsewhere |
| 409 | `userRoutes.errors.phoneExists` | Phone used elsewhere |
| 409 | `userRoutes.errors.registrationNumberExists` | BR number used by another NGO |
| 500 | `common.internalError` | Transaction rolled back |

---

### GET /v2/account/edit-ngo/{ngoId}/pet-placement-options

Return the list of configured pet placement options for the NGO (used by adoption flows).

**Lambda:** UserRoutes  
**Auth:** Bearer JWT; role must be `ngo`

**Path params:** `ngoId` (ObjectId)

**Success (200):**

```json
{
  "success": true,
  "petPlacementOptions": ["foster", "adoption", "rescue"],
  "requestId": "..."
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `userRoutes.errors.ngo.missingId` | ngoId missing |
| 400 | `userRoutes.errors.ngo.invalidId` | ngoId invalid |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Role ≠ `ngo` |
| 404 | `userRoutes.errors.ngo.notFound` | NGO not found |
| 500 | `common.internalError` | |
