# CreatePetBasicInfo Test Report

**Date:** 2026-04-22
**Service:** `CreatePetBasicInfo` Lambda (direct handler invocation)
**Primary suite:** `__tests__/test-createpetbasicinfo-unit.test.js`
**Effective result:** **18 tests declared and passed ✅**
**DB-gated count:** **4 DB-backed tests** require `MONGODB_URI` and `TEST_OWNER_USER_ID` in `env.json`; they skip gracefully when absent

---

## 1. What Was Tested

Tests invoke the Lambda handler directly (without SAM local) by calling `require("../functions/CreatePetBasicInfo")` after setting `process.env` from `env.json`. All assertions are made against the returned Lambda response object. The suite covers CORS preflight, JWT authentication, input guard validation, method enforcement, schema validation (including unknown-field and NoSQL-injection rejection), and DB-backed creation lifecycle.

Current status:

- All 18 declared tests pass.
- CORS preflight returns `204` with correct headers for `OPTIONS /pets/create-pet-basic-info`.
- JWT middleware rejects missing, expired, tampered, and `alg:none` tokens; error response shape is verified.
- Guard layer rejects malformed JSON body and empty request body before schema or DB work begins.
- Method enforcement layer returns `405` for unsupported `GET` and `DELETE` methods.
- Schema validation (Zod `superRefine`) rejects bodies that include `userId` or `ngoId` fields as unknown and rejects NoSQL injection objects in name fields.
- DB-backed tests create a real pet document, verify the response shape and field sanitization, assert that a caller-supplied `userId` in the body is silently ignored (server injects `userId` from the JWT), confirm that an invalid JSON body does not create a rate-limit entry, and assert that a duplicate `tagId` returns `409`.

### 1.1 Endpoint Coverage

| Endpoint / Area | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/pets/create-pet-basic-info` | OPTIONS | 2 | Allowed-origin `204`, non-OPTIONS returns early |
| JWT middleware | Cross-cutting | 5 | Missing, expired, tampered, `alg:none`, error shape |
| Guard validation | Cross-cutting | 2 | Malformed JSON `400`, empty body `400` |
| Method enforcement | Cross-cutting | 2 | GET `405`, DELETE `405` |
| Schema validation | Cross-cutting | 3 | `userId` in body `400`, `ngoId` in body `400`, NoSQL injection in name `400` |
| `/pets/create-pet-basic-info` | POST (DB-backed) | 4 | Create `201`, caller `userId` ignored, no rate-limit on invalid JSON, duplicate `tagId` `409` |
| **Total defined in suite** | N/A | **18** | 4 are DB-gated on `MONGODB_URI` + `TEST_OWNER_USER_ID` |

### 1.2 Test Categories

#### Happy-path flows

- `POST /pets/create-pet-basic-info` with a valid JWT and complete body → `201` with sanitized response shape
- Response includes `petId`, `tagId`, and basic info fields; no internal fields such as `_id`, `deleted`, `owner`, or `userId` are exposed

#### Input validation — 400/405 responses

- Malformed JSON body → `400`
- Empty body → `400`
- Body containing `userId` field → `400 unknownField`
- Body containing `ngoId` field → `400 unknownField`
- NoSQL injection object in `name` field → `400`
- Unsupported `GET` → `405`
- Unsupported `DELETE` → `405`

#### Business-logic errors — 4xx responses

- Duplicate `tagId` already existing in the database → `409 pet.duplicateTag`

#### Authentication

- No `Authorization` header → `401`
- Expired JWT → `401`
- Tampered JWT signature → `401`
- `alg:none` JWT → `401`
- Error shape includes `success: false`, `errorKey`, and `requestId`

---

## 2. Test Strategy

The suite uses **direct handler invocation** rather than SAM local. The handler is loaded with `require("../functions/CreatePetBasicInfo")` after injecting environment variables from `env.json` into `process.env`. DNS servers are set to `8.8.8.8` / `1.1.1.1` at the top of `loadHandler()` to ensure reliable MongoDB Atlas connectivity during local test runs.

DB-backed tests use a `cleanupState` object that tracks all created pet IDs and seeded rate-limit keys and removes them in `afterAll`. A unique `tagId` prefix using `Date.now()` prevents collisions across parallel or repeated runs.

DB-gated tests are wrapped in `dbTest(name, fn)`, which skips when `process.env.MONGODB_URI` or `process.env.TEST_OWNER_USER_ID` is absent. This allows the schema and JWT suites to run in CI environments without a live database.

---

## 3. Security Notes

- **Mass-assignment prevention**: The Zod schema uses `superRefine` to reject any body that contains `userId` or `ngoId` as input fields. The `userId` is always taken from the verified JWT payload and injected server-side, never from the request body.
- **NoSQL injection prevention**: Zod validates that name, description, and similar string fields are actual strings. Object values such as `{ "$ne": "" }` are rejected at the schema layer before reaching any Mongoose query.
- **Rate limiting**: The handler records create attempts per user. The test confirms that a body that fails JSON parsing does not increment the rate-limit counter, preventing an attacker from filling the counter with malformed requests.
- **Duplicate `tagId` protection**: The DB layer catches Mongoose duplicate-key errors and returns `409` rather than allowing the insert to fail silently or overwrite an existing record.
- **Response sanitization**: The response is projected to a safe allowlist; internal DB fields (`_id`, `deleted`, `owner`, `userId`, `ngoId`, `ngoPetId`) are not returned to the caller.
