# PetDetailInfo API

**Base URL (Dev / AWS API Gateway):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

---

## Overview

PetDetailInfo manages extended pet detail data for the PetPetClub platform. It covers detail-info fields, transfer records, NGO-to-user transfer, rescue/origin source records, and post-adoption records.

This refactor preserved the existing route surface and request/response contracts where possible. It was a UserRoutes-style stabilization and hardening pass, not an API redesign.

### API Gateway Requirements

For the deployed API Gateway endpoint, every request must include a valid `x-api-key` header.

```http
x-api-key: <api-gateway-api-key>
```

This requirement applies to all PetDetailInfo endpoints. Requests that omit the header are rejected by API Gateway before Lambda route logic runs, typically with `403 Forbidden`.

Local SAM testing does not enforce this gateway-level requirement unless explicitly simulated. The integration tests in `__tests__/test-petdetailinfo.test.js` exercise Lambda behavior through `sam local start-api`, not API Gateway usage-plan enforcement.

### Authentication

All PetDetailInfo routes require a JWT Bearer token.

```http
Authorization: Bearer <token>
```

There are no public resources in this Lambda. CORS `OPTIONS` preflight is handled before authentication; all non-OPTIONS routes go through JWT verification.

Protected routes enforce DB-backed pet ownership. The authenticated caller must satisfy one of:

- `pet.userId === event.userId`
- `pet.ngoId === event.ngoId`

The NGO transfer route is additionally role-protected. `PUT /pets/{petID}/detail-info/NGOtransfer` requires a valid Bearer token whose `userRole` is `ngo`; valid non-NGO tokens return `403`.

JSON body endpoints reject malformed JSON before service logic runs and return `400` with `common.invalidJSON`.

### Required Headers By Scenario

#### Deployed API Gateway

```http
Content-Type: application/json
x-api-key: <api-gateway-api-key>
Authorization: Bearer <jwt-access-token>
```

#### Local frontend or web app calling the AWS Dev API

```http
Content-Type: application/json
x-api-key: <api-gateway-api-key>
Authorization: Bearer <jwt-access-token>
```

Even if the frontend is running on `localhost`, requests to the AWS Dev Base URL still require `x-api-key` because API Gateway enforces it.

#### Local SAM integration testing

```http
Content-Type: application/json
Authorization: Bearer <jwt-access-token>
```

`x-api-key` is not required for the local SAM flow used by the current integration suite.

### Request Lifecycle

PetDetailInfo follows the same lifecycle shape as the refactored UserRoutes baseline:

1. OPTIONS preflight
2. JWT authentication
3. cheap guard validation
4. MongoDB connection
5. DB-backed pet ownership check
6. exact route dispatch
7. service execution
8. structured catch-all error handling

### Integration Notes For Frontends And LLM Clients

- Always send `x-api-key` when calling the deployed API Gateway URL.
- Always send `Authorization: Bearer <token>` for non-OPTIONS requests.
- Treat `errorKey` as the stable machine-readable field for automation and test assertions.
- Use `?lang=en` for English error messages; default messages are Traditional Chinese.
- If a deployed request fails with `403` before any documented Lambda `errorKey` is returned, check missing or invalid `x-api-key` first.
- Source and adoption create endpoints are application-level duplicate protected; true concurrent duplicate safety still requires DB unique indexes on `pet_sources.petId` and `pet_adoptions.petId`.

### Error Response Shape

Every error returns this consistent JSON body:

```json
{
  "success": false,
  "errorKey": "petNotFound",
  "error": "Pet not found",
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

### Detail Info

All detail-info endpoints require `Authorization: Bearer <token>` and enforce pet ownership before route dispatch.

#### GET /pets/{petID}/detail-info

Returns extended detail information for an owned pet.

**Auth:** Bearer token. Pet ownership enforced.

**Path:** `petID` - MongoDB ObjectId

**Success (200):**

```json
{
  "success": true,
  "form": {
    "chipId": "CHIP-001",
    "motherName": "Mother",
    "motherParity": 2
  },
  "petId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `invalidPetIdFormat` | Invalid `petID` ObjectId |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petNotFound` | Pet does not exist or has already been deleted |

---

#### POST /pets/{petID}/detail-info

Partially updates extended detail information for an owned pet. Only provided allowlisted fields are updated. Unknown fields are stripped by Zod.

**Auth:** Bearer token. Pet ownership enforced.

**Path:** `petID` - MongoDB ObjectId

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `chipId` | string | No | |
| `placeOfBirth` | string | No | |
| `motherName` | string | No | |
| `motherBreed` | string | No | |
| `motherDOB` | string | No | Calendar-strict `YYYY-MM-DD`, `DD/MM/YYYY`, or supported ISO timestamp |
| `motherChip` | string | No | |
| `motherPlaceOfBirth` | string | No | |
| `motherParity` | number/string | No | Numeric strings are coerced to number |
| `fatherName` | string | No | |
| `fatherBreed` | string | No | |
| `fatherDOB` | string | No | Calendar-strict `YYYY-MM-DD`, `DD/MM/YYYY`, or supported ISO timestamp |
| `fatherChip` | string | No | |
| `fatherPlaceOfBirth` | string | No | |

**Example:**

```json
{
  "chipId": "CHIP-001",
  "motherDOB": "29/02/2024",
  "motherParity": "2"
}
```

**Success (200):**

```json
{
  "success": true,
  "form": {
    "chipId": "CHIP-001",
    "motherParity": 2
  },
  "petId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` | Malformed JSON request body |
| 400 | `others.missingParams` | Empty request body |
| 400 | `invalidPetIdFormat` | Invalid `petID` ObjectId |
| 400 | `petDetailInfo.invalidDateFormat` | Invalid `motherDOB` or `fatherDOB` |
| 400 | `petDetailInfo.invalidMotherParity` | `motherParity` is not numeric |
| 400 | `others.noFieldsToUpdate` | Body contains no valid update fields after Zod stripping |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petNotFound` | Pet does not exist or has already been deleted |

---

### Transfer

Transfer endpoints manage embedded transfer records on the owned pet document. Pet writes include `{ _id: petID, deleted: false }`; transfer update/delete also include `"transfer._id": transferId` and verify `matchedCount`.

#### POST /pets/{petID}/detail-info/transfer

Creates a transfer record for an owned pet.

**Auth:** Bearer token. Pet ownership enforced.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `regDate` | string | No | Calendar-strict `YYYY-MM-DD`, `DD/MM/YYYY`, or supported ISO timestamp |
| `regPlace` | string | No | |
| `transferOwner` | string | No | |
| `transferContact` | string | No | |
| `transferRemark` | string | No | |

**Success (200):**

```json
{
  "success": true,
  "form": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "regPlace": "Hong Kong",
    "transferOwner": "New Owner"
  },
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "transferId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `transferPath.invalidDateFormat` | Invalid transfer date |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petNotFound` | Pet does not exist or has already been deleted |

---

#### PUT /pets/{petID}/detail-info/transfer/{transferId}

Partially updates a transfer record.

**Auth:** Bearer token. Pet ownership enforced.

**Path:** `petID`, `transferId` - MongoDB ObjectIds

**Body:** Same fields as transfer create. Unknown fields are stripped.

**Success (200):**

```json
{
  "success": true,
  "form": {
    "regPlace": "Hong Kong"
  },
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "transferId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `transferPath.invalidTransferIdFormat` | Invalid `transferId` ObjectId |
| 400 | `transferPath.invalidDateFormat` | Invalid transfer date |
| 400 | `others.noFieldsToUpdate` | Body contains no valid update fields after Zod stripping |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `transferPath.transferNotFound` | Transfer record does not exist on this pet |

---

#### DELETE /pets/{petID}/detail-info/transfer/{transferId}

Deletes one transfer record from the owned pet document using a guarded `$pull`.

**Auth:** Bearer token. Pet ownership enforced.

**Success (200):**

```json
{
  "success": true,
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "transferId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `transferPath.invalidTransferIdFormat` | Invalid `transferId` ObjectId |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `transferPath.transferNotFound` | Transfer record does not exist on this pet |

---

### NGO Transfer

#### PUT /pets/{petID}/detail-info/NGOtransfer

Transfers a pet from an NGO to a target user.

**Auth:** Bearer token. Pet ownership enforced. NGO role required.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `UserEmail` | string | Yes | Target user email |
| `UserContact` | string | Yes | Target user E.164 phone number |
| `regDate` | string | No | Calendar-strict `YYYY-MM-DD`, `DD/MM/YYYY`, or supported ISO timestamp |
| `regPlace` | string | No | |
| `transferOwner` | string | No | |
| `transferContact` | string | No | |
| `transferRemark` | string | No | |
| `isTransferred` | boolean | No | |

**Example:**

```json
{
  "UserEmail": "target@example.com",
  "UserContact": "+85291234567",
  "regDate": "2024-02-29",
  "transferOwner": "New Owner"
}
```

**Rules:**

- Email is normalized before lookup.
- Missing email or phone matches return the same neutral `404 ngoTransfer.targetUserNotFound`.
- Email and phone must resolve to the same user id, otherwise `400 ngoTransfer.userIdentityMismatch`.
- Optional `transfer.0.*` fields are only updated when present in the request body.

**Success (200):**

```json
{
  "success": true,
  "form": {
    "UserEmail": "target@example.com",
    "UserContact": "+85291234567",
    "transferOwner": "New Owner"
  },
  "petId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `ngoTransfer.missingRequiredFields` | Missing `UserEmail` or `UserContact` |
| 400 | `ngoTransfer.invalidEmailFormat` | Invalid email format |
| 400 | `ngoTransfer.invalidPhoneFormat` | Invalid phone format |
| 400 | `ngoTransfer.invalidDateFormat` | Invalid transfer date |
| 400 | `ngoTransfer.userIdentityMismatch` | Email and phone resolve to different users |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.ngoOnly` | Caller is authenticated but not an NGO user |
| 403 | `others.forbidden` | NGO does not own this pet |
| 404 | `ngoTransfer.targetUserNotFound` | Target email or phone did not resolve to a user |
| 404 | `petNotFound` | Pet does not exist or has already been deleted |

---

### Source v2

Source endpoints manage rescue/origin information stored in `pet_sources`. Only one source record is allowed per pet at the application level.

#### GET /v2/pets/{petID}/detail-info/source

Returns the source record for an owned pet. If no source record exists, the response still succeeds with a null/empty source payload depending on current stored state.

**Auth:** Bearer token. Pet ownership enforced.

**Success (200):**

```json
{
  "success": true,
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "sourceId": "665f1a2b3c4d5e6f7a8b9c0d",
  "form": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "placeofOrigin": "Hong Kong",
    "channel": "rescue"
  }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `invalidPetIdFormat` | Invalid `petID` ObjectId |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petNotFound` | Pet does not exist or has already been deleted |

---

#### POST /v2/pets/{petID}/detail-info/source

Creates rescue/origin information for an owned pet.

At least one of `placeofOrigin` or `channel` is required.

**Auth:** Bearer token. Pet ownership enforced.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `placeofOrigin` | string | Conditional | Required if `channel` is absent |
| `channel` | string | Conditional | Required if `placeofOrigin` is absent |
| `rescueCategory` | string[] | No | |
| `causeOfInjury` | string | No | |

**Success (201):**

```json
{
  "success": true,
  "form": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "placeofOrigin": "Hong Kong",
    "channel": "rescue"
  },
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "sourceId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petSource.missingRequiredFields` | Neither `placeofOrigin` nor `channel` was provided |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 409 | `petSource.duplicateRecord` | A source record already exists for this pet |

---

#### PUT /v2/pets/{petID}/detail-info/source/{sourceId}

Partially updates a source record. The write predicate includes both `_id` and `petId`.

**Auth:** Bearer token. Pet ownership enforced.

**Body:** Same fields as source create. All fields are optional on update.

**Success (200):**

```json
{
  "success": true,
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "sourceId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petSource.invalidSourceIdFormat` | Invalid `sourceId` ObjectId |
| 400 | `petSource.noFieldsToUpdate` | Body contains no valid update fields after Zod stripping |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petSource.recordNotFound` | Source record does not exist for this pet |

---

### Adoption v2

Adoption endpoints manage post-adoption information stored in `pet_adoptions`. Only one adoption record is allowed per pet at the application level.

#### GET /v2/pets/{petID}/pet-adoption

Returns the post-adoption record for an owned pet.

**Auth:** Bearer token. Pet ownership enforced.

**Success (200):**

```json
{
  "success": true,
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "adoptionId": "665f1a2b3c4d5e6f7a8b9c0d",
  "form": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "postAdoptionName": "Lucky",
    "isNeutered": true
  }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `invalidPetIdFormat` | Invalid `petID` ObjectId |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petNotFound` | Pet does not exist or has already been deleted |

---

#### POST /v2/pets/{petID}/pet-adoption

Creates post-adoption information for an owned pet.

**Auth:** Bearer token. Pet ownership enforced.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `postAdoptionName` | string | No | |
| `isNeutered` | boolean | No | |
| `NeuteredDate` | string/null | No | Calendar-strict `YYYY-MM-DD`, `DD/MM/YYYY`, or supported ISO timestamp |
| `firstVaccinationDate` | string/null | No | Calendar-strict date |
| `secondVaccinationDate` | string/null | No | Calendar-strict date |
| `thirdVaccinationDate` | string/null | No | Calendar-strict date |
| `followUpMonth1` | boolean | No | |
| `followUpMonth2` | boolean | No | |
| `followUpMonth12` | boolean | No | |

**Success (201):**

```json
{
  "success": true,
  "form": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "postAdoptionName": "Lucky",
    "isNeutered": true
  },
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "adoptionId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petAdoption.invalidDateFormat` | Invalid adoption date field |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 409 | `petAdoption.duplicateRecord` | An adoption record already exists for this pet |

---

#### PUT /v2/pets/{petID}/pet-adoption/{adoptionId}

Partially updates a post-adoption record. The write predicate includes both `_id` and `petId`.

**Auth:** Bearer token. Pet ownership enforced.

**Body:** Same fields as adoption create. All fields are optional on update.

**Success (200):**

```json
{
  "success": true,
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "adoptionId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petAdoption.invalidAdoptionIdFormat` | Invalid `adoptionId` ObjectId |
| 400 | `petAdoption.invalidDateFormat` | Invalid adoption date field |
| 400 | `petAdoption.noFieldsToUpdate` | Body contains no valid update fields after Zod stripping |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petAdoption.recordNotFound` | Adoption record does not exist for this pet |

---

#### DELETE /v2/pets/{petID}/pet-adoption/{adoptionId}

Deletes a post-adoption record. The delete predicate includes both `_id` and `petId`.

**Auth:** Bearer token. Pet ownership enforced.

**Success (200):**

```json
{
  "success": true,
  "petId": "665f1a2b3c4d5e6f7a8b9c0d",
  "adoptionId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petAdoption.invalidAdoptionIdFormat` | Invalid `adoptionId` ObjectId |
| 401 | `others.unauthorized` | Missing or invalid JWT |
| 403 | `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| 404 | `petAdoption.recordNotFound` | Adoption record does not exist for this pet |

---

### Unsupported Methods

Unsupported method/resource pairs return `405 others.methodNotAllowed` only when the request reaches the Lambda router. In SAM/API Gateway, undeclared methods can be intercepted earlier and returned as API Gateway `403`.

---

## Complete errorKey Reference

| errorKey | Default message (en) |
| --- | --- |
| `others.unauthorized` | Unauthorized |
| `others.forbidden` | You do not have permission to access this pet |
| `others.ngoOnly` | This operation is restricted to NGO accounts |
| `others.internalError` | Internal Server Error |
| `others.methodNotAllowed` | Method Not Allowed |
| `others.missingParams` | Missing required parameters |
| `others.noFieldsToUpdate` | No valid fields to update |
| `common.invalidJSON` | Invalid JSON format |
| `missingPetId` | Pet ID is required |
| `invalidPetIdFormat` | Invalid pet ID format |
| `petNotFound` | Pet not found |
| `transferPath.invalidTransferIdFormat` | Invalid transfer ID format |
| `transferPath.transferNotFound` | Transfer record not found |
| `transferPath.invalidDateFormat` | Invalid date format |
| `ngoTransfer.missingRequiredFields` | UserEmail and UserContact are required |
| `ngoTransfer.invalidEmailFormat` | Invalid email format |
| `ngoTransfer.invalidPhoneFormat` | Invalid phone number format |
| `ngoTransfer.invalidDateFormat` | Invalid date format |
| `ngoTransfer.userIdentityMismatch` | The email and phone number do not belong to the same user |
| `ngoTransfer.targetUserNotFound` | Target user not found |
| `petDetailInfo.invalidDateFormat` | Invalid date format |
| `petDetailInfo.invalidMotherParity` | Mother parity must be a valid number |
| `petSource.invalidSourceIdFormat` | Invalid rescue/origin record ID format |
| `petSource.recordNotFound` | Rescue/origin record not found |
| `petSource.noFieldsToUpdate` | No fields provided to update |
| `petSource.missingRequiredFields` | At least one of place of origin or channel is required |
| `petSource.duplicateRecord` | A source record already exists for this pet |
| `petAdoption.invalidDateFormat` | Invalid date format |
| `petAdoption.invalidAdoptionIdFormat` | Invalid adoption ID format |
| `petAdoption.recordNotFound` | Post-adoption record not found |
| `petAdoption.noFieldsToUpdate` | No fields provided to update |
| `petAdoption.duplicateRecord` | An adoption record already exists for this pet |

---

## Test Coverage

Current integration suite: `__tests__/test-petdetailinfo.test.js`

Latest verified run:

```text
PASS  __tests__/test-petdetailinfo.test.js (114.624 s)
Test Suites: 1 passed, 1 total
Tests:       82 passed, 82 total
```

Coverage includes CORS, JWT auth, guard validation, ownership, detail-info update validation, transfer lifecycle, NGO transfer RBAC/validation, source/adoption lifecycle, duplicate handling, response shape, NoSQL injection guards, and cleanup.

## Known Constraints

- Source/adoption duplicate creation is mitigated by code-level `checkDuplicates()` and `409` responses. True concurrent-request safety still requires DB unique indexes on `pet_sources.petId` and `pet_adoptions.petId`.
- Transfer and adoption hard-delete behavior is preserved for API compatibility.
- Router-level `405` is difficult to observe through SAM/API Gateway for undeclared methods because API Gateway returns its own missing-route `403`.
