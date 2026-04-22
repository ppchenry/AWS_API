# PetInfoByPetNumber Test Report

**Date:** 2026-04-22
**Service:** `PetInfoByPetNumber` Lambda (direct handler invocation)
**Primary suite:** `__tests__/test-petinfobypetnumber.test.js`
**Effective result:** **13 tests declared and passed ✅**
**DB-gated count:** **3 tag-lookup tests** require `MONGODB_URI` in `env.json`; they skip gracefully when absent

---

## 1. What Was Tested

Tests invoke the Lambda handler directly (without SAM local) by calling `require("../functions/PetInfoByPetNumber")` after setting `process.env` from `env.json`. All assertions are made against the returned Lambda response object. The suite covers CORS preflight, guard validation (missing, blank, and over-length tag IDs), method enforcement, and tag-lookup lifecycle (found public fields only, missing tag anti-enumeration, soft-deleted pet anti-enumeration).

Current status:

- All 13 declared tests pass.
- CORS preflight returns `204` for allowed origins and `403` for disallowed or missing origins.
- Guard layer rejects missing `tagId`, blank/whitespace-only `tagId`, and `tagId` exceeding 120 characters; error shape is verified.
- Method enforcement layer returns `405` for `POST`, `PUT`, and `DELETE`.
- Tag-lookup tests seed a real pet document, verify that only public-safe fields are returned (internal fields such as `userId`, `ngoId`, `ngoPetId`, `ownerContact1`, `ownerContact2`, and `contact1Show`/`contact2Show` are suppressed), confirm that a non-existent `tagId` returns `200` with an all-null form (anti-enumeration pattern), and confirm that a soft-deleted pet also returns the same `200`+null form.

### 1.1 Endpoint Coverage

| Endpoint / Area | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/pets/getPetInfobyTagId/{tagId}` | OPTIONS | 3 | Allowed-origin `204`, disallowed-origin `403`, missing-origin `403` |
| Guard validation | Cross-cutting | 4 | Missing `tagId` `400`, blank `tagId` `400`, over-length `tagId` `400`, error shape |
| Method enforcement | Cross-cutting | 3 | POST `405`, PUT `405`, DELETE `405` |
| Tag lookup (DB-backed) | GET | 3 | Found pet returns sanitized public fields, missing `tagId` returns `200`+null form, soft-deleted pet returns `200`+null form |
| **Total defined in suite** | N/A | **13** | 3 are DB-gated on `MONGODB_URI` |

### 1.2 Test Categories

#### Happy-path flows

- `GET /pets/getPetInfobyTagId/{tagId}` with a known tag returns `200` with sanitized public pet fields
- Response includes public fields such as `name`, `species`, `breed`, `gender`, `birthday`, `photoUrl`, `contactable` contact fields respecting `contact1Show`/`contact2Show` toggles
- Internal fields (`userId`, `ngoId`, `ngoPetId`, `ownerContact1`, `ownerContact2`, `contact1Show`, `contact2Show`, `deleted`) are absent from the response

#### Anti-enumeration — 200 responses with null form

- Non-existent `tagId` → `200` with all-null form fields (not `404`)
- Soft-deleted pet tag → `200` with all-null form fields (not `404` or `410`)
- This pattern prevents callers from enumerating valid tag IDs by observing 404 versus 200 distinctions

#### Input validation — 400/405 responses

- Missing `tagId` path parameter → `400`
- Blank or whitespace-only `tagId` → `400`
- `tagId` exceeding 120 characters → `400`
- Error shape includes `success: false`, `errorKey`, and CORS headers
- Unsupported `POST` → `405`
- Unsupported `PUT` → `405`
- Unsupported `DELETE` → `405`

---

## 2. Test Strategy

The suite uses **direct handler invocation** as its primary strategy. The handler is loaded with `require("../functions/PetInfoByPetNumber")` after injecting environment variables from `env.json`. The DB connection is obtained via `getReadConnection` from `../functions/PetInfoByPetNumber/src/config/db` so that the seeded documents share the same connection as the handler under test.

DB-backed tests use a `seedPet(overrides)` helper that inserts a test document with a unique `tagId` using the prefix `PIBN-TEST-${Date.now()}`. An `afterAll` cleanup step deletes all documents matching the `PIBN-TEST-` prefix pattern to prevent accumulating test data across runs.

A key source fix was required during this phase: `functions/PetInfoByPetNumber/src/utils/sanitize.js` had no null guard on its `sanitizePet` function. When called with a `null` pet (missing tag), `null.toObject` threw a `TypeError` → `500`. A null guard was added that returns an all-null form object when `pet` is `null`, matching the intentional anti-enumeration design of the handler.

---

## 3. Security Notes

- **Tag enumeration prevention (anti-enumeration pattern)**: The endpoint always returns `200`. When a `tagId` is not found or the pet is soft-deleted, it returns an all-null form instead of `404` or `410`. This prevents callers from using the status code difference to enumerate valid tag IDs or to detect which deleted tags existed.
- **Internal field sanitization**: The `sanitizePet` function projects only the fields in `PUBLIC_PET_FIELDS`. Owner contact information respects the `contact1Show` and `contact2Show` toggles: if a flag is `false`, the corresponding contact field is omitted from the response.
- **Soft-delete filtering**: Deleted pets are treated the same as missing pets at the sanitize layer. The caller receives no indication of whether the record existed and was deleted.
- **Read-only enforcement**: Only `GET` is supported. `POST`, `PUT`, and `DELETE` all return `405`, preventing accidental writes to this public-facing endpoint.
- **Input length cap**: `tagId` is capped at 120 characters on the guard layer, limiting the cost of any downstream tag lookup on excessively long input.
