# PetMedicalRecord Test Report

**Date:** 2026-04-20
**Service:** `PetMedicalRecord` Lambda (AWS SAM)
**Primary integration suite:** `__tests__/test-petmedicalrecord.test.js`
**Additional unit suite:** `__tests__/test-petmedicalrecord-bloodtest-aggregate.test.js`
**Result:** **65 / 65 integration tests passed ✅**
**Additional blood-test aggregate unit coverage:** **3 / 3 tests passed ✅**

---

## 1. What Was Tested

Tests were run against a live SAM local environment connected to the UAT MongoDB cluster (`petpetclub_uat`) plus a focused blood-test aggregate unit suite with mocked persistence dependencies. Integration tests sent real HTTP requests and asserted on HTTP status codes, response body fields, and machine-readable error keys.

Current status:

- The main PetMedicalRecord integration suite is fully green and exercises the real Lambda handler, JWT middleware, guard layer, DB bootstrap, router, and live UAT-backed CRUD behavior.
- All 16 active pet-scoped routes across medical, medication, deworm, and blood-test records are covered.
- Owner and matching NGO authorization paths are covered with live fixture-backed requests, while stranger access is explicitly denied with `403`.
- The blood-test aggregate unit suite is fully green and covers `bloodTestRecordsCount` / `latestBloodTestDate` maintenance on create, update, and delete.
- Delete routes remain intentionally hard delete because these domain record schemas do not expose a `deleted` field. The current test baseline therefore verifies auth and ownership gating around delete rather than soft-delete semantics.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/pets/{petID}/medical-record` | GET | 5 | Auth, owner read, stranger denial, sanitization, not-found |
| `/pets/{petID}/medical-record` | POST | 4 | Happy path, invalid date, malformed JSON, empty body |
| `/pets/{petID}/medical-record/{medicalID}` | PUT | 5 | Empty body, unknown field, not-found, field clear, invalid id |
| `/pets/{petID}/medical-record/{medicalID}` | DELETE | 4 | Mismatch not-found, owner delete, auth-gated route |
| `/pets/{petID}/medication-record` | GET | 4 | Owner read, stranger denial, sanitization, invalid pet id |
| `/pets/{petID}/medication-record` | POST | 3 | Happy path, invalid date, falsey value preservation |
| `/pets/{petID}/medication-record/{medicationID}` | PUT | 3 | Unknown field, not-found, invalid id |
| `/pets/{petID}/medication-record/{medicationID}` | DELETE | 3 | Mismatch not-found, owner delete |
| `/pets/{petID}/deworm-record` | GET | 3 | NGO read, invalid pet id, owner fixture access |
| `/pets/{petID}/deworm-record` | POST | 3 | Happy path, invalid date, validation |
| `/pets/{petID}/deworm-record/{dewormID}` | PUT | 4 | Not-found, falsey value preservation, invalid id |
| `/pets/{petID}/deworm-record/{dewormID}` | DELETE | 3 | Mismatch not-found, owner delete |
| `/pets/{petID}/blood-test-record` | GET | 4 | Happy path, invalid pet id, stable success shape |
| `/pets/{petID}/blood-test-record` | POST | 3 | Happy path, invalid date, NoSQL-style input rejection |
| `/pets/{petID}/blood-test-record/{bloodTestID}` | PUT | 4 | Unknown field, not-found, invalid id |
| `/pets/{petID}/blood-test-record/{bloodTestID}` | DELETE | 3 | Mismatch not-found, owner delete |
| Cross-cutting security | — | 14 | CORS, JWT negative cases, guard validation, unsupported method |
| **Total** | | **65** | |

### 1.1.1 Blood-Test Aggregate Unit Coverage

| Suite | Scope | Tests | Result |
| --- | --- | --- | --- |
| `__tests__/test-petmedicalrecord-bloodtest-aggregate.test.js` | `functions/PetMedicalRecord/src/services/bloodTest.js` | 3 | 3 / 3 passed |

### 1.2 Test Categories

#### Happy-path flows

- Owner reads medical and medication records on a live fixture pet
- Matching NGO reads medical and deworm records on a live fixture pet
- Owner creates, updates, lists, and deletes records across medical, medication, deworm, and blood-test domains
- Blood-test aggregate unit coverage for create/update/delete summary maintenance

#### Input validation — 400 responses

Every route family now exercises negative validation cases individually:

- Malformed JSON request bodies
- Empty POST / PUT request bodies
- Invalid MongoDB ObjectId path params for pet and record IDs
- Impossible calendar dates such as `2024-02-31`
- Unknown request-body keys rejected by strict Zod schemas
- NoSQL-style operator object payloads rejected by schema validation

#### Business-logic errors — 4xx responses

- Non-existent pets return `404 petNotFound`
- Non-existent record IDs on update return record-specific `404`
- Non-existent record IDs on delete return record-specific `404`
- Unsupported methods return API-layer `403/405` depending on SAM / API Gateway handling

#### Authentication & authorisation

- No `Authorization` header → `401`
- Garbage Bearer token → `401`
- Expired JWT → `401`
- Tampered JWT signature → `401`
- `alg:none` JWT attack → `401`
- Missing `Bearer ` prefix → `401`
- Valid stranger token on another pet → `403 others.forbidden`
- Matching NGO token on NGO-linked pet → `200`

#### Security hardening

- **JWT verification hardening** — HS256-pinned verification rejects expired, tampered, malformed, and `alg:none` tokens
- **Exact ownership enforcement** — pet access is derived from the loaded pet plus JWT `userId` / `ngoId`, not caller-controlled body fields
- **Strict schema enforcement** — extra fields are rejected rather than silently persisted or stripped into ambiguous updates
- **NoSQL injection rejection** — operator-like objects such as `{ "$gt": "" }` are rejected with `400`
- **Sanitized record responses** — returned record documents do not expose `__v`, `createdAt`, or `updatedAt`
- **Delete hardening** — delete routes are JWT-protected and ownership-gated even though the domain contract intentionally remains hard delete
- **CORS hardening** — only explicitly allowed origins receive preflight success and response CORS headers

---

## 2. How Frontend Can Trace Errors

Every error response from PetMedicalRecord follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "others.invalidJSON",
  "error": "JSON 格式無效",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors. Safe to check as a gate. |
| `errorKey` | `string` | Machine-readable dot-notation key. Use this to branch UI behavior or analytics. |
| `error` | `string` | Human-readable translated message (`zh` by default, `en` with `?lang=en`). |
| `requestId` | `string` | AWS Lambda request ID for CloudWatch lookup. Present on structured errors when available. |

### Frontend Usage Pattern

```js
const res = await fetch(`/pets/${petId}/medical-record`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const data = await res.json();

if (!data.success) {
  showToast(data.error);
  console.error("[API Error]", data.errorKey, "requestId:", data.requestId);

  if (data.errorKey === "others.forbidden") {
    redirectToPetList();
  } else if (data.errorKey === "medicalRecord.invalidDateFormat") {
    highlightDateField();
  }
}
```

### CloudWatch Log Lookup

```text
AWS Console → CloudWatch → Log Groups → /aws/lambda/PetMedicalRecord
  → Search by requestId value
```

### Error Key Reference Table

The main `errorKey` values exercised and verified in the PetMedicalRecord suite:

| errorKey | Meaning |
| --- | --- |
| `others.unauthorized` | Missing, malformed, expired, or invalid JWT |
| `others.forbidden` | Caller does not own the pet and NGO does not match |
| `others.invalidJSON` | Request body is malformed JSON |
| `others.missingParams` | Required POST / PUT body is empty |
| `others.methodNotAllowed` | Unsupported route method handled by Lambda |
| `others.internalError` | Unexpected server error |
| `missingPetId` | Missing `petID` path param |
| `invalidPetIdFormat` | Invalid `petID` ObjectId format |
| `petNotFound` | Pet missing or deleted |
| `medicalRecord.invalidMedicalIdFormat` | Invalid `medicalID` ObjectId format |
| `medicalRecord.medicalRecordNotFound` | Medical record not found for this pet |
| `medicalRecord.invalidDateFormat` | Medical date failed calendar validation |
| `medicalRecord.noFieldsToUpdate` | No valid updatable medical fields remain |
| `medicationRecord.invalidMedicationIdFormat` | Invalid `medicationID` ObjectId format |
| `medicationRecord.medicationRecordNotFound` | Medication record not found for this pet |
| `medicationRecord.invalidDateFormat` | Medication date failed calendar validation |
| `medicationRecord.noFieldsToUpdate` | No valid updatable medication fields remain |
| `dewormRecord.invalidDewormIdFormat` | Invalid `dewormID` ObjectId format |
| `dewormRecord.dewormRecordNotFound` | Deworm record not found for this pet |
| `dewormRecord.invalidDateFormat` | Deworm date failed calendar validation |
| `dewormRecord.noFieldsToUpdate` | No valid updatable deworm fields remain |
| `bloodTest.invalidBloodTestIdFormat` | Invalid `bloodTestID` ObjectId format |
| `bloodTest.bloodTestRecordNotFound` | Blood-test record not found for this pet |
| `bloodTest.invalidDateFormat` | Blood-test date failed calendar validation |
| `bloodTest.noFieldsToUpdate` | No valid updatable blood-test fields remain |

---

## 3. Security Measures Verified

| Attack | Mitigation | Verified |
| --- | --- | --- |
| Expired / tampered JWT | `jsonwebtoken.verify()` rejects → 401 | ✅ |
| `alg:none` JWT bypass | JWT verification is pinned to HS256 → 401 | ✅ |
| Accessing another user’s pet data | DB-backed ownership / NGO check returns `403` | ✅ |
| Malformed JSON request bodies | Guard rejects invalid JSON before route logic → 400 | ✅ |
| Invalid ObjectId path params | Guard rejects invalid pet / record ids → 400 | ✅ |
| Mass assignment via extra fields | Strict Zod schemas reject unknown keys → 400 | ✅ |
| NoSQL operator injection (`{ "$gt": "" }`) | Zod type validation rejects object payloads → 400 | ✅ |
| Raw Mongoose field leakage | Sanitizer strips `__v`, `createdAt`, `updatedAt` | ✅ |
| Cross-pet record mutation | Update/delete queries scope by `_id` and `petId` | ✅ |
| CORS origin drift | Explicit allowlist and required `ALLOWED_ORIGINS` env | ✅ |
| Blood-test aggregate drift | Aggregate helper maintains count/latest-date contract | ✅ (unit suite) |
| Unauthenticated delete execution | Delete routes require JWT and authorized pet access | ✅ |

Accepted schema-bound constraint:

- Delete flows remain hard delete because the domain record schemas do not expose a `deleted` field. This is treated as a schema contract decision, not an ownership or auth gap.

---

## 4. Test Environment

| Item | Value |
| --- | --- |
| Runtime | Node.js 22 (AWS SAM Local) |
| Test framework | Jest 29.7 (`--runInBand`) |
| Database | MongoDB Atlas UAT (`petpetclub_uat`) |
| Blood-test aggregate unit suite | Mocked persistence dependencies; no live DB writes |
| SAM command | `sam local start-api --env-vars env.json --warm-containers EAGER` |
| Run command | `npm test -- --runInBand __tests__/test-petmedicalrecord.test.js __tests__/test-petmedicalrecord-bloodtest-aggregate.test.js` |

### Latest Verified Results

```text
PASS  __tests__/test-petmedicalrecord.test.js
Test Suites: 1 passed, 1 total
Tests:       65 passed, 65 total

PASS  __tests__/test-petmedicalrecord-bloodtest-aggregate.test.js
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```
