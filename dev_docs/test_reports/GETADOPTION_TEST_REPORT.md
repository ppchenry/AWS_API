# GetAdoption Test Report

**Date:** 2026-04-22
**Service:** `GetAdoption` Lambda (pure unit — all dependencies mocked)
**Primary suite:** `__tests__/test-getadoption-unit.test.js`
**Effective result:** **21 tests declared and passed ✅**
**No SAM and no live database required** — all Mongoose model calls are mocked with `jest.spyOn` and `jest.doMock`

---

## 1. What Was Tested

Tests call the Lambda handler directly via `require("../functions/GetAdoption")` with all Mongoose model interactions replaced by `jest.spyOn` mocks. No SAM local process and no live MongoDB connection are needed for any test in this suite. The suite covers CORS allowlist behavior, input guard validation, method enforcement, service-layer logic (query building, projection coverage, filter normalization, regex-escaped search, and response shape), and the public-route assertion that `authJWT` is never invoked on public adoption endpoints.

Current status:

- All 21 declared tests pass.
- CORS preflight returns `204` for allowed origins and `403` for disallowed or missing origins.
- `handleOptions` returns `undefined` (not `null`) for non-OPTIONS requests, confirming the early-exit guard is correctly bypassed for actual method calls.
- Guard layer rejects invalid adoption `ObjectId` format, `page` value of `0`, non-numeric `page`, and `search` strings exceeding 100 characters; it normalizes valid list filters and defaults `page` to `1` when the param is absent.
- Router layer returns `405` for the removed `POST /adoption/{id}` route.
- Service layer is verified for `getAdoptionList` (success path, empty-result `maxPage: 0` path) and `getAdoptionById` (`404` when pet is missing, detail payload structure including adoption-website required fields).
- Public-route assertion confirms that `authJWT` is never called when public adoption routes are invoked, verifying the CORS/auth bypass design.

### 1.1 Endpoint Coverage

| Endpoint / Area | Method | Tests | Notes |
| --- | --- | --- | --- |
| `/adoption` + `/adoption/{id}` | OPTIONS | 4 | Allowed-origin `204`, disallowed-origin `403`, missing-origin `403`, non-OPTIONS early exit |
| Guard validation | Cross-cutting | 7 | Invalid ObjectId, `page=0`, non-numeric page, search > 100 chars, filter normalization, default page 1, accepts valid ObjectId |
| Router enforcement | Cross-cutting | 1 | Removed POST `/adoption/{id}` returns `405` |
| Public-route bypass | Cross-cutting | 1 | Confirms `authJWT` is never invoked on adoption routes |
| Service: `getAdoptionList` | GET `/adoption` | 3 | Success with items, empty result `maxPage: 0`, pagination shape |
| Service: `getAdoptionById` | GET `/adoption/{id}` | 5 | `404` petNotFound, detail payload shape, adoption-website required fields, `Remark` field, sanitized form fields |
| **Total defined in suite** | N/A | **21** | No DB or SAM required |

### 1.2 Test Categories

#### Happy-path flows

- `GET /adoption` returns a paginated list with `items`, `page`, `maxPage`, and `total` fields
- `GET /adoption/{id}` returns a detail payload matching the `sanitizeAdoption` contract (`pet` key containing the form shape)
- Response includes adoption-website-required fields (`Remark`, `basicInfo`, `detailInfo`, etc.)

#### Input validation — 400/405 responses

- Invalid `adoptionId` format (not a valid MongoDB ObjectId) → `400 adoption.invalidId`
- `page=0` → `400 getAdoption.errors.invalidPage`
- Non-numeric `page` → `400 getAdoption.errors.invalidPage`
- `search` string longer than 100 characters → `400 adoption.searchTooLong`
- Removed `POST /adoption/{id}` route → `405`

#### Business-logic errors — 4xx responses

- `getAdoptionById` when the adoption document does not exist → `404 adoption.notFound`

#### Public-route and auth behavior

- Adoption endpoints are confirmed public: `authJWT` middleware is never called
- CORS allowlist is enforced: only whitelisted origins receive `204` preflight

---

## 2. Test Strategy

The suite uses **pure unit testing with Jest mocks** as its primary strategy. Each test group reloads the handler via `jest.resetModules()` followed by `jest.doMock()` so that the Mongoose model layer can be replaced with fresh spies for each describe block. This approach gives full isolation for service-layer branching without requiring a running database or SAM process.

`LIST_PROJECTION` and `DETAIL_PROJECTION` constants are imported from the service module to ensure the mock assertions stay in sync with the real projection definitions used in production.

The `loadCors(origins)` helper rebuilds the CORS module with a specific origin allowlist so that origin behavior can be tested without touching real environment variables.

Because all tests are pure unit tests, this suite runs in any environment including CI pipelines with no external dependencies.

---

## 3. Security Notes

- **Public route design**: Adoption listings and detail pages are intentionally public (no auth required). The test suite explicitly verifies that `authJWT` is never invoked for adoption routes, preventing a future regression where auth middleware might accidentally be added and break the public API contract.
- **ReDoS prevention via regex escaping**: The `search` query parameter is regex-escaped before being passed into the Mongoose `$regex` query. The guard layer also caps search strings at 100 characters to limit the input space for any pattern-matching cost.
- **Projection enforcement**: `LIST_PROJECTION` and `DETAIL_PROJECTION` are defined constants that limit which fields Mongoose returns. The test verifies that the response shape matches the projection rather than exposing arbitrary document fields.
- **Input normalization**: The guard layer normalizes `page`, `limit`, and `search` filter values before passing them to the service. Out-of-range or missing values are silently normalized to defaults rather than propagated to Mongoose queries.
