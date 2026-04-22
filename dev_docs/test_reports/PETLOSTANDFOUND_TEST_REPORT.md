# PetLostandFound Test Report

**Date:** 2026-04-15
**Service:** `PetLostandFound` Lambda (AWS SAM)
**Primary test suite:** `__tests__/test-petlostandfound.test.js`
**Result:** **59 / 59 tests passed ✅**
**Duration:** `~72 seconds`

---

## 1. What Was Tested

Tests were run against a live SAM local environment (`sam local start-api --env-vars env.json --warm-containers EAGER`) connected to the UAT MongoDB cluster (`petpetclub_uat`). Integration tests sent real HTTP requests and asserted on HTTP status codes, response body fields, and machine-readable error keys.

Current status:

- Lost-pet, found-pet, and notification routes are all covered through live integration requests.
- Ownership, self-access, malformed input, and rate-limit behavior are explicitly asserted.
- Multipart create flows and notification archive flows are stable in the current suite.
- The report also captures the runtime bug found during testing and the code fix applied.

### 1.1 Endpoint Coverage

| Endpoint | Method | Tests |
|----------|--------|-------|
| `/pets/pet-lost` | OPTIONS | 2 |
| `/pets/pet-lost` | GET | 4 |
| `/pets/pet-lost` | POST | 4 |
| `/pets/pet-lost/{petLostID}` | DELETE | 4 |
| `/pets/pet-found` | OPTIONS | 1 |
| `/pets/pet-found` | GET | 2 |
| `/pets/pet-found` | POST | 2 |
| `/pets/pet-found/{petFoundID}` | DELETE | 3 |
| `/v2/account/{userId}/notifications` | OPTIONS | 1 |
| `/v2/account/{userId}/notifications` | GET | 3 |
| `/v2/account/{userId}/notifications` | POST | 5 |
| `/v2/account/{userId}/notifications/{notificationId}` | PUT | 4 |
| Route dispatch (unmapped methods) | PUT, PATCH | 2 |
| Cross-cutting (auth, response shape) | — | 7 |
| Rate limiting (pet-lost, pet-found create) | POST | 2 |
| DB cleanup | — | 4 |
| **Total** | | **59** |

### 1.2 Test Categories

#### Happy-path flows

- List all lost pets → 200 with `{ count, pets }` array
- List all found pets → 200 with `{ count, pets }` array
- Create lost pet via multipart form → 201 with `{ id }`
- Create found pet via multipart form → 201
- Delete own lost pet record → 200
- List own notifications → 200 with `{ count, notifications }` array
- Empty notifications list → 200 with `{ count: 0, notifications: [] }` (not 404)
- Create notification → 200 with `{ id }`
- Create notification with petId → 200
- Archive notification → 200
- CORS preflight on all route groups → 204 with correct headers

#### Input validation — 400 responses

- Missing required fields on pet-lost POST → 400
- Missing required fields on pet-found POST → 400
- Invalid ObjectId format on petId in pet-lost POST → 400
- Nonexistent pet referenced by petId → 404
- Invalid petId format in notification POST → 400
- Missing `type` field in notification POST → 400
- Malformed JSON body on notification POST → 400 (`common.invalidJSON`)
- Empty body on notification POST/PUT → 400 (`common.missingParams`)
- Invalid ObjectId in path params (petLostID, petFoundID, notificationId) → 400 (`common.invalidPathParam`)

#### Authentication & authorization

- No Authorization header → 401 (`common.unauthorized`)
- Expired JWT → 401
- Garbage Bearer token → 401
- Wrong JWT secret → 401
- Missing auth on POST multipart → 401
- Self-access enforcement: accessing another user's notifications → 403 (`common.selfAccessDenied`)
- Self-access enforcement: posting to another user's notifications → 403
- Ownership enforcement: deleting another user's pet-lost record → 403 (`common.selfAccessDenied`)
- Compound query enforcement: archiving another user's notification → 404 (no match)

#### Security hardening

- **Rate limiting** — pet-lost and pet-found create routes return 429 (`common.rateLimited`) after 5 requests in 60 seconds per user
- **isArchived injection** — `isArchived: true` in notification create body is ignored; notification is created normally
- **Ownership on delete** — DELETE routes fetch the record, check `userId` ownership, and return 403 if the caller is not the owner
- **Guard ordering** — self-access check fires before ObjectId format validation (deny early principle)
- **CORS origin validation** — disallowed origin on OPTIONS → 403
- **`__v` exclusion** — all list responses exclude Mongoose version key
- **Response shape** — error responses include `success: false`, `errorKey`, `error` (translated), `requestId`

#### Edge cases

- Delete already-deleted record → 404
- Delete with nonexistent ObjectId → 404
- Unmapped HTTP methods (PUT /pets/pet-lost, PATCH /pets/pet-found) → 405 or 403

---

## 2. How Frontend Can Trace Errors

Every error response follows a fixed shape:

```json
{
  "success": false,
  "errorKey": "common.unauthorized",
  "error": "未經授權的訪問",
  "requestId": "3b1c2d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

### Field Reference

| Field | Type | Purpose |
| --- | --- | --- |
| `success` | `boolean` | Always `false` for errors |
| `errorKey` | `string` | Machine-readable dot-notation key for `switch`/`if` routing |
| `error` | `string` | Human-readable translated message (`zh` default, `en` with `?lang=en`) |
| `requestId` | `string` | AWS Lambda request ID for CloudWatch log lookup |

### CloudWatch Log Lookup

```text
AWS Console -> CloudWatch -> Log Groups -> /aws/lambda/PetLostandFound
  -> Search by requestId value
```

### Error Key Reference Table

| errorKey | Context |
| --- | --- |
| `common.unauthorized` | Missing, expired, or invalid JWT |
| `common.selfAccessDenied` | JWT userId ≠ path userId, or not record owner |
| `common.invalidJSON` | Malformed JSON body |
| `common.missingParams` | Empty body on POST/PUT |
| `common.invalidPathParam` | Path parameter fails ObjectId validation |
| `common.methodNotAllowed` | HTTP method not mapped for this resource |
| `common.rateLimited` | Rate limit exceeded (5 req/60s on create routes) |
| `common.internalError` | Unhandled server error |
| `petLostAndFound.errors.petLost.petNotFound` | petId references a nonexistent pet |
| `petLostAndFound.errors.petLost.notFound` | Pet-lost record not found (for delete) |
| `petLostAndFound.errors.petLost.idRequired` | Missing petLostID path param |
| `petLostAndFound.errors.petFound.notFound` | Pet-found record not found (for delete) |
| `petLostAndFound.errors.petFound.idRequired` | Missing petFoundID path param |
| `petLostAndFound.errors.notifications.notFound` | Notification not found (for archive) |
| `petLostAndFound.errors.notifications.notificationIdRequired` | Missing notificationId path param |

---

## 3. Security Measures Verified

| Attack / Risk | Mitigation | Verified |
| --- | --- | --- |
| Missing or invalid JWT | Auth guard rejects missing, expired, malformed, and wrong-secret tokens | ✅ |
| Cross-user notification access | Self-access enforcement compares JWT userId against path userId | ✅ |
| Cross-owner lost-pet deletion | Ownership check returns 403 for non-owners | ✅ |
| Archive mutation on another user's notification | Compound query prevents cross-user archive and returns 404 | ✅ |
| Create-route abuse | Pet-lost and pet-found creates rate-limit at 5 req / 60 s per user | ✅ |
| `isArchived` mass-assignment injection | Create flow ignores caller-supplied `isArchived: true` | ✅ |
| Invalid ObjectId path injection | Path params validated before downstream DB logic | ✅ |
| Malformed JSON body | Guard returns `400 common.invalidJSON` | ✅ |
| Empty request body | POST and PUT body guards return `400 common.missingParams` | ✅ |
| CORS origin abuse | Disallowed origins on OPTIONS return 403 | ✅ |
| Internal field leakage | List responses exclude `__v` and preserve fixed error shape | ✅ |
| Legacy or unmapped methods | Unsupported methods return 405 or are blocked before handler logic | ✅ |

---

## 4. Additional Notes

### Bugs Found & Fixed During Testing

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | **Critical** | `mime` v4 is ESM-only — `require("mime")` threw `ERR_REQUIRE_ESM` in Lambda Docker runtime, causing all pet-lost and pet-found routes to return 500 | Replaced static `require("mime")` with lazy `async getMime()` using dynamic `import()` with module-level caching in `src/services/imageUpload.js` |
| 2 | Low | Rate limit test used non-hex userIds (e.g. `rl_lost_...`) causing CastError | Test-only fix — userIds now generated as valid 24-char hex strings |


### Test Environment

| Component | Version/Config |
| --- | --- |
| Runtime | nodejs22.x (SAM Docker) |
| Node.js (host) | v24.14.0 |
| Mongoose | v9.2.0 |
| Zod | v4.3.6 |
| jsonwebtoken | v9.0.2 |
| mime | v4.1.0 (ESM, dynamic import) |
| lambda-multipart-parser | v1.0.1 |
| @aws-sdk/client-s3 | v3.986.0 |
| MongoDB | Atlas cluster (petpetclub_uat) |
| SAM CLI | sam local start-api with --warm-containers EAGER |


### How To Run

```bash
# Terminal 1 — Start SAM local
sam build
sam local start-api --env-vars env.json --warm-containers EAGER

# Terminal 2 — Run tests
npm test -- --testPathPattern=test-petlostandfound
```

Tests auto-clean up test data via DB-backed cleanup (requires `MONGODB_URI` in `env.json` `PetLostandFoundFunction`).


### Remaining Gaps

| Item | Owner | Status |
| --- | --- | --- |
| Serial number race condition | infra | Deferred — needs DB unique index |
| Hard delete → soft delete migration | code | Deferred |
| File upload integration test (actual S3 write) | test | Not covered — would need S3 mocking or localstack |
| Horizontal privilege on pet status mutation (petId ownership) | code | **FIXED** in v2.0.0 audit round 4 |
