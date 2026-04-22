# PetVaccineRecords Test Report

**Date:** 2026-04-22
**Service:** `PetVaccineRecords` Lambda (AWS SAM)
**Primary integration suite:** `__tests__/test-petvaccinerecords.test.js`
**Effective result:** **34 integration tests declared and passed ✅**
**Fixture-gated count:** **19 owner-gated tests** require `TEST_PET_ID`, `TEST_OWNER_USER_ID`, and `TEST_NGO_ID` in `env.json` to run the live CRUD and authorization paths; they skip gracefully when those keys are absent

---

## 1. What Was Tested

Tests were run against a live SAM local environment on port `3000` with the PetVaccineRecords Lambda connected to the MongoDB environment configured in `env.json`. The suite sends real HTTP requests and asserts on HTTP status codes, CORS headers, response body fields, machine-readable `errorKey` values, JWT validation behavior, and persisted MongoDB state for vaccine record CRUD flows.

Current status:

- All 34 declared tests pass.
- CORS preflight handling is verified for allowed, disallowed, and missing origins.
- JWT middleware rejects missing, expired, garbage, tampered, `alg:none`, and non-Bearer-prefix tokens.
- Guard-layer validation is verified for malformed JSON, empty POST body, empty PUT body, invalid `petId` format, invalid `vaccineId` format, and NoSQL injection object in body fields.
- Router-level error cases are verified: `404` for non-existent pet, and `403` for undeclared `PATCH` method (returned before Lambda invocation by API Gateway).
- Authorization is verified: owner can GET; stranger cannot GET; NGO with the correct `ngoId` can GET; stranger is denied POST, PUT, and DELETE.
- CRUD lifecycle is verified: impossible date rejection, create, empty-body PUT rejection, unknown-field-only PUT rejection, update-on-nonexistent 404, owner update, delete-on-nonexistent 404, cross-pet scope rejection (record addressed via wrong petId), and soft-delete.
- A fixture config sanity check warns when all three env keys are absent so future runs are not silently skipping live DB tests.

### 1.1 Endpoint Coverage

| Endpoint / Area | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/pets/{petId}/vaccine-record` | OPTIONS | 3 | Allowed-origin preflight, disallowed-origin `403`, missing-origin `403` |
| JWT middleware | Cross-cutting | 7 | Missing, expired, garbage, no Bearer prefix, tampered, `alg:none`, error shape |
| Guard validation | Cross-cutting | 6 | Malformed JSON, empty POST, empty PUT, invalid `petId`, invalid `vaccineId`, NoSQL injection |
| `/pets/{petId}/vaccine-record` | GET / POST | 2 | `404` petNotFound, `403` on undeclared PATCH |
| Authorization layer | Cross-cutting | 6 | Owner GET `200`, stranger GET `403`, NGO GET `200`, stranger POST `403`, stranger PUT `403`, stranger DELETE `403` |
| `/pets/{petId}/vaccine-record` / `/{vaccineId}` | GET / POST / PUT / DELETE | 9 | Impossible date `400`, create `200`, empty PUT `400`, unknown-field PUT `400`, update 404, owner update `200`, delete 404, cross-pet mutation `404`, soft-delete `200` |
| Fixture config | N/A | 1 | Warns when `TEST_PET_ID`, `TEST_OWNER_USER_ID`, `TEST_NGO_ID` all absent |
| **Total defined in suite** | N/A | **34** | 19 are `ownerTest` / `ngoTest` gated on env keys |

### 1.2 Test Categories

#### Happy-path flows

- Owner retrieves vaccine record list via `GET /pets/{petId}/vaccine-record`
- Owner creates a vaccine record via `POST /pets/{petId}/vaccine-record` → `200`
- Owner updates a vaccine record via `PUT /pets/{petId}/vaccine-record/{vaccineId}` → `200`
- Owner soft-deletes a vaccine record via `DELETE /pets/{petId}/vaccine-record/{vaccineId}` → `200`
- NGO with matching `ngoId` retrieves vaccine record list → `200`

#### Input validation — 400 responses

- Malformed JSON request body → `400`
- Empty POST body → `400`
- Empty PUT body → `400`
- Invalid `petId` format on guard layer → `400`
- Invalid `vaccineId` format on guard layer → `400`
- NoSQL injection object in `vaccineName` field → `400`
- Impossible date (day 32) on create → `400`
- Empty body on PUT → `400`
- PUT with only unknown/disallowed field → `400`

#### Business-logic errors — 4xx responses

- Pet not found → `404 vaccine.petNotFound`
- Update on nonexistent vaccine record → `404 vaccine.notFound`
- Delete on nonexistent vaccine record → `404 vaccine.notFound`
- Cross-pet scope: vaccine record addressed via wrong `petId` → `404`
- Undeclared `PATCH` method → `403` (returned by API Gateway before Lambda invocation)

#### Authentication and authorisation

- No `Authorization` header → `401`
- Expired JWT → `401`
- Garbage Bearer token → `401`
- Token without `Bearer` prefix → `401`
- Tampered JWT signature → `401`
- `alg:none` JWT attack → `401`
- Error shape includes `success: false`, `errorKey`, and `requestId`
- Stranger access to owner pet on GET → `403`
- Stranger attempt to POST / PUT / DELETE on fixture pet → `403`
- NGO with matching `ngoId` can read; stranger NGO is denied

---

## 2. Test Strategy

The suite uses **SAM local integration** as its primary strategy. All HTTP interactions go through the real SAM runtime and the real Lambda handler, giving end-to-end confidence in the routing, middleware, validation, authorization, and DB lifecycle layers simultaneously.

Fixture-gated tests (`ownerTest` / `ngoTest`) are conditional on `TEST_PET_ID`, `TEST_OWNER_USER_ID`, and `TEST_NGO_ID` being present in `env.json`. When absent, those tests are skipped rather than failing. The fixture config sanity check emits a `console.warn` on first run when all three keys are missing so that the skip is always visible rather than silent.

An `afterAll` cleanup step deletes any vaccine records created by the test suite to prevent accumulating test data across multiple runs.

Key JWT helpers used by the suite:

| Helper | Purpose |
| --- | --- |
| `makeToken(payload, secret, opts)` | Builds arbitrary JWTs for edge-case signing tests |
| `ownerAuth` | Valid JWT with owner `userId` |
| `strangerAuth` | Valid JWT with a different userId |
| `ngoAuth` | Valid JWT with NGO `ngoId` |
| `expiredAuth` | JWT with `expiresIn: 0` |
| `tamperedAuth` | Valid JWT with last character of signature changed |
| `noneAlgAuth` | JWT with `alg: none` header |

---

## 3. Security Notes

- **Cross-pet scope isolation**: CRUD operations filter by both `petId` and `vaccineId`. A vaccine record belonging to pet A cannot be read, updated, or deleted by addressing it under pet B's path.
- **NoSQL injection prevention**: The guard layer uses Zod schema validation. Passing an object `{ "$gt": "" }` in `vaccineName` is rejected with `400` rather than being passed into a Mongoose query operator.
- **Soft-delete enforcement**: The Lambda applies `ACTIVE_VACCINE_FILTER` to list queries so that soft-deleted records are not returned to callers, preventing resurrection of deleted data through repeated GET calls.
- **Ownership and NGO access**: Owner access is validated by matching the `userId` claim in the JWT against the pet's `userId` field. NGO access is validated by matching the `ngoId` claim against the pet's `ngoId` field. Strangers have no read or write access regardless of how their JWT is signed.
- **API Gateway method pre-screening**: Undeclared HTTP methods such as `PATCH` are rejected at the API Gateway level with `403` before the Lambda is ever invoked. This eliminates a category of method-confusion attacks at the infrastructure layer.
