# PetDetailInfo Test Report

**Date:** 2026-04-17
**Service:** `PetDetailInfo` Lambda (AWS SAM)
**Primary integration suite:** `__tests__/test-petdetailinfo.test.js`
**Result:** **82 / 82 integration tests passed**
**Duration:** `114.624 s`

---

## 1. What Was Tested

Tests were run against a live SAM local environment connected to the configured MongoDB environment. Integration tests sent real HTTP requests and asserted on HTTP status codes, response body fields, machine-readable error keys, and lifecycle side effects.

Current status:

- The full PetDetailInfo integration suite is green.
- All 13 active API routes are covered.
- CORS, JWT auth, guard validation, ownership, service validation, lifecycle writes, duplicate handling, response shape, NoSQL injection guards, and cleanup are covered.
- Router-level `405` is represented as SAM/API Gateway `403` for undeclared method+path combinations, matching the local integration environment.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
| --- | --- | ---: |
| `/pets/{petID}/detail-info` | OPTIONS | 3 |
| `/v2/pets/{petID}/detail-info/source` | OPTIONS | 1 |
| `/v2/pets/{petID}/pet-adoption` | OPTIONS | 1 |
| Cross-route JWT authentication | - | 6 |
| Guard path-param validation | - | 4 |
| Guard body validation | - | 5 |
| Cross-route ownership enforcement | - | 5 |
| `/pets/{petID}/detail-info` | GET/POST | 15 |
| `/pets/{petID}/detail-info/transfer` | POST | 2 |
| `/pets/{petID}/detail-info/transfer/{transferId}` | PUT/DELETE | 6 |
| `/pets/{petID}/detail-info/NGOtransfer` | PUT | 4 |
| `/v2/pets/{petID}/detail-info/source` | GET/POST | 5 |
| `/v2/pets/{petID}/detail-info/source/{sourceId}` | PUT | 4 |
| `/v2/pets/{petID}/pet-adoption` | GET/POST | 5 |
| `/v2/pets/{petID}/pet-adoption/{adoptionId}` | PUT/DELETE | 6 |
| Unsupported methods | - | 2 |
| Response shape | - | 2 |
| NoSQL injection prevention | - | 2 |
| Cleanup | - | 4 |
| **Total** | | **82** |

### 1.2 Test Categories

#### CORS preflight

- Allowed origin returns `204` with CORS headers.
- Disallowed origin returns `403`.
- Missing `Origin` returns `403`.
- v2 source and adoption preflights return `204` for allowed origins.
- OPTIONS is handled before JWT authentication.

#### Authentication and authorization

- Missing `Authorization` header returns `401 others.unauthorized`.
- Expired JWT returns `401`.
- Garbage token returns `401`.
- Wrong-secret token returns `401`.
- `alg:none` token returns `401`.
- Token without `Bearer ` prefix returns `401`.
- Stranger token cannot access another user's detail info, transfer, source, or adoption data.
- Ownership denial returns `403 others.forbidden`.
- NGO transfer rejects non-NGO callers with `403 others.ngoOnly`.

#### Input validation - 400 responses

Every required guard and validation path is checked individually:

- Invalid `petID` -> `400 invalidPetIdFormat`
- Invalid `transferId` -> `400 transferPath.invalidTransferIdFormat`
- Invalid `sourceId` -> `400 petSource.invalidSourceIdFormat`
- Invalid `adoptionId` -> `400 petAdoption.invalidAdoptionIdFormat`
- Malformed JSON -> `400 common.invalidJSON`
- Empty POST/PUT bodies -> `400 others.missingParams`
- Invalid detail dates -> `400 petDetailInfo.invalidDateFormat`
- Invalid transfer dates -> `400 transferPath.invalidDateFormat`
- Invalid NGO transfer email -> `400 ngoTransfer.invalidEmailFormat`
- Invalid NGO transfer phone -> `400 ngoTransfer.invalidPhoneFormat`
- Missing NGO transfer fields -> `400 ngoTransfer.missingRequiredFields`
- Invalid source/adoption update payloads -> `400`
- Empty Zod-stripped source/adoption updates -> `400 noFieldsToUpdate`

#### Business-logic errors - 4xx responses

- Nonexistent pet -> `404 petNotFound`
- Nonexistent transfer update/delete -> `404 transferPath.transferNotFound`
- Duplicate source create -> `409 petSource.duplicateRecord`
- Nonexistent source update -> `404 petSource.recordNotFound`
- Duplicate adoption create -> `409 petAdoption.duplicateRecord`
- Nonexistent adoption update/delete -> `404 petAdoption.recordNotFound`
- SAM/API Gateway undeclared methods return `403` before Lambda router execution

#### Detail-info flow

- Snapshot/restore protects the original fixture state.
- GET returns `200` with `form` and `petId`.
- POST updates allowlisted fields such as `chipId`.
- DD/MM/YYYY and YYYY-MM-DD dates are accepted.
- Malformed ISO timestamp suffixes and out-of-range time fields are rejected.
- `motherParity` accepts numbers and numeric strings.
- Non-numeric `motherParity` returns `400`.
- Unknown fields are stripped and do not become persisted fields.

#### Transfer flow

- Transfer create returns `200` and produces a `transferId`.
- Transfer create accepts DD/MM/YYYY date values.
- Transfer update returns `200`.
- Invalid transfer update body returns `400` before DB lookup.
- Nonexistent transfer update returns `404`.
- Transfer delete returns `200`.
- Nonexistent transfer delete returns `404`, verifying the full predicate and `matchedCount` behavior.

#### Source and adoption flows

- Source GET returns `200`.
- Source POST returns `201` and includes `sourceId`.
- Duplicate source POST returns `409`.
- Source PUT uses `_id + petId` scoping and returns `404` when no record matches.
- Adoption GET returns `200`.
- Adoption POST returns `201` and includes `adoptionId`.
- Duplicate adoption POST returns `409`.
- Adoption create/update reject invalid dates.
- Adoption PUT uses `_id + petId` scoping and returns `404` when no record matches.
- Adoption DELETE returns `200`, and repeated/nonexistent delete returns `404`.

#### Response shape and injection hardening

- Error responses include `{ success: false, errorKey, error }`.
- Success responses include `{ success: true, ... }`.
- ObjectId operator-shaped `petID` payloads are rejected as invalid ObjectIds.
- Operator-shaped body values are rejected by Zod or treated as scalar strings, not MongoDB operators.

---

## 2. How Frontend Can Trace Errors

Every error response from PetDetailInfo follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "petNotFound",
  "error": "Pet not found",
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
const res = await fetch(`/pets/${petID}/detail-info`, {
  method: "GET",
  headers: { Authorization: `Bearer ${token}` }
});
const data = await res.json();

if (!data.success) {
  showToast(data.error);
  console.error("[PetDetailInfo API Error]", data.errorKey, "requestId:", data.requestId);

  if (data.errorKey === "others.forbidden") {
    redirectToPetList();
  } else if (data.errorKey === "petDetailInfo.invalidDateFormat") {
    highlightDateFields();
  }
}
```

### CloudWatch Log Lookup

```text
AWS Console -> CloudWatch -> Log Groups -> /aws/lambda/PetDetailInfo
  -> Search by requestId value
```

### Error Key Reference Table

The main `errorKey` values used across PetDetailInfo:

| errorKey | Meaning |
| --- | --- |
| `others.unauthorized` | Missing or invalid JWT |
| `others.forbidden` | Caller does not own the pet and is not the pet's NGO |
| `others.ngoOnly` | Caller is authenticated but not an NGO user |
| `others.missingParams` | Empty request body or missing required parameters |
| `others.noFieldsToUpdate` | No valid detail/transfer fields remain after validation stripping |
| `others.methodNotAllowed` | Method/resource pair reached Lambda router but is unsupported |
| `common.invalidJSON` | Malformed JSON request body |
| `invalidPetIdFormat` | Invalid pet ObjectId |
| `petNotFound` | Pet does not exist or is deleted |
| `transferPath.invalidTransferIdFormat` | Invalid transfer ObjectId |
| `transferPath.transferNotFound` | Transfer record does not exist on this pet |
| `transferPath.invalidDateFormat` | Invalid transfer date |
| `ngoTransfer.invalidEmailFormat` | Invalid target email |
| `ngoTransfer.invalidPhoneFormat` | Invalid target phone |
| `ngoTransfer.invalidDateFormat` | Invalid NGO transfer date |
| `ngoTransfer.userIdentityMismatch` | Target email and phone resolve to different users |
| `ngoTransfer.targetUserNotFound` | Target email or phone did not resolve to a user |
| `petDetailInfo.invalidDateFormat` | Invalid mother/father date |
| `petDetailInfo.invalidMotherParity` | Mother parity is not numeric |
| `petSource.invalidSourceIdFormat` | Invalid source ObjectId |
| `petSource.recordNotFound` | Source record does not exist for this pet |
| `petSource.noFieldsToUpdate` | No valid source fields remain after validation stripping |
| `petSource.missingRequiredFields` | Source create omitted both `placeofOrigin` and `channel` |
| `petSource.duplicateRecord` | Source record already exists for this pet |
| `petAdoption.invalidDateFormat` | Invalid adoption date field |
| `petAdoption.invalidAdoptionIdFormat` | Invalid adoption ObjectId |
| `petAdoption.recordNotFound` | Adoption record does not exist for this pet |
| `petAdoption.noFieldsToUpdate` | No valid adoption fields remain after validation stripping |
| `petAdoption.duplicateRecord` | Adoption record already exists for this pet |

---

## 3. Security Measures Verified

| Attack / Risk | Mitigation | Verified |
| --- | --- | --- |
| Missing/invalid JWT | `authJWT` verifies every non-OPTIONS route with HS256 pinned -> 401 | Yes |
| `alg:none` JWT bypass | JWT library is called with `algorithms: ["HS256"]` -> 401 | Yes |
| Horizontal pet access / IDOR | DB-backed ownership middleware checks JWT identity against Pet ownership -> 403 | Yes |
| Non-NGO NGO transfer | Guard-layer RBAC rejects non-NGO tokens before service execution -> 403 | Yes |
| Malformed JSON request bodies | Guard rejects invalid JSON before route logic -> 400 | Yes |
| Invalid ObjectIds | Guard validates `petID`, `transferId`, `sourceId`, and `adoptionId` -> 400 | Yes |
| Mass assignment | Zod strips unknown fields; services build explicit update maps | Yes |
| Date parsing ambiguity | Calendar-strict validator rejects invalid days, junk suffixes, and invalid time ranges | Yes |
| Duplicate source/adoption in normal flow | `checkDuplicates()` returns `409` before create | Yes |
| Transfer delete TOCTOU | Full write predicate plus `matchedCount` check | Yes |
| Source/adoption write takeover | `_id + petId` write predicates and write-count checks | Yes |
| Target-user enumeration in NGO transfer | Single neutral missing-user error for email or phone misses | Code-reviewed; validation branches tested |
| User identity mismatch in NGO transfer | Email and phone must resolve to the same `_id` | Code-reviewed |
| NoSQL operator injection | Object-shaped path/body values are rejected or treated as scalar data | Yes |
| Response leakage | Projections and sanitizers limit outbound payloads | Code-reviewed and route-tested |

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`) |
| Database | Configured MongoDB environment used by SAM local |
| SAM command | `sam local start-api --env-vars env.json` |
| Run command | `npm test -- --testPathPattern=test-petdetailinfo` |
| Fixture config | `env.json PetDetailInfoFunction`: `TEST_PET_ID`, `TEST_OWNER_USER_ID`, optional `TEST_NGO_ID` |

### Latest Verified Results

```text
PASS  __tests__/test-petdetailinfo.test.js (114.624 s)
Test Suites: 1 passed, 1 total
Tests:       82 passed, 82 total
```

### Known Limitations

| Item | Reason |
| --- | --- |
| Router-level `405` through SAM | API Gateway intercepts undeclared method/path combinations and returns its own `403`. |
| Concurrent duplicate create race | Code-level duplicate checks are not atomic. DB unique indexes on `pet_sources.petId` and `pet_adoptions.petId` are still required. |
| Source cleanup | No source DELETE route exists; test cleanup removes source directly through MongoDB. |
