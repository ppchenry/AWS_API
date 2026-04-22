# GetAdoption - CHANGELOG

## Refactor v2.0.1 - Public Read Hardening And Sign-Off Docs

### Scope

Follow-up hardening patch after the Tier 3 modularized refactor to remove unnecessary auth surface on fully public routes, tighten outbound Mongo projections, and add the missing handoff documentation required by the repo refactor checklist.

**Changed**: public-route auth handling, public read projection, unit coverage, refactor documentation

### Security Changes

- `src/handler.js` no longer invokes `authJWT()` for `GET /adoption` or `GET /adoption/{id}`
- Public read requests no longer attach JWT-derived claims or dev-bypass identity onto `event`
- `src/services/adoption.js` now uses explicit field projection for both list and detail reads so new internal Mongo fields do not leak by default
- Disallowed OPTIONS preflight now returns through `createErrorResponse()` so CORS denial uses the shared envelope and locale translation path

### Functional Notes

- Route set is unchanged: the Lambda still serves public read-only adoption listing and detail retrieval
- Response shape remains compatible with the adoption website contract for list cards and detail pages
- Sanitization remains in place as defense in depth, but projection is now the primary least-data-exposure control for DB reads

### Documentation And Verification Updates

- Added `API.md`, `README.md`, and this changelog for GetAdoption sign-off completeness
- Latest focused verification status: `10 passed` in `__tests__/test-getadoption-unit.test.js` on `2026-04-22`

### Deferred Follow-Up Risks

- `models/Adoption.js` is stale relative to the runtime field set actually queried from `adoption_list`; this patch intentionally did not widen into a schema reconciliation change
- GetAdoption still uses `NEW_MONGODB_URI` instead of the monorepo baseline `MONGODB_URI`; that env-name migration should be handled as a separate compatibility-reviewed change

---

## Refactor v2.0.0 - In-Situ Modernization

### Scope

Tier 3 modernization of the GetAdoption Lambda from a legacy direct-entry implementation into a small modular `src/` layout with centralized CORS, auth, guard, DB bootstrap, routing, response helpers, and logging.

**Changed**: entrypoint, request lifecycle orchestration, DB bootstrap, validation, routing, response formatting, structured logging
**Not changed in this refactor stage**: public route set, adoption website response contract

### Result Of This Stage

GetAdoption serves public read-only adoption data through a standardized request lifecycle, with exact route matching, Lambda-safe DB reuse, localized error responses, and focused validation for list filters and adoption ids.