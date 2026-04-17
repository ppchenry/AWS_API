# PetDetailInfo Refactor Changelog

## Scope

This changelog documents the current PetDetailInfo refactor stage completed after local SAM testing and route-level verification.

This stage was an internal refactor, not an API redesign.

Goals for this stage:

- preserve the existing 13 endpoint shapes and request/response contracts where possible
- improve maintainability, security, validation behavior, and local testability
- reduce the operational risk of changing a single large monolithic Lambda file
- align the implementation with the UserRoutes/refactor-checklist baseline
- avoid database schema changes and frontend contract changes that are outside current control

## Summary Compared To The Old Monolith

The previous implementation concentrated routing, parsing, validation, authorization assumptions, MongoDB access, transfer logic, source logic, adoption logic, and response handling in one large Lambda entry file.

The current implementation keeps the same route surface, but moves that logic into smaller modules with clearer responsibilities.

Main improvement in this stage:

- safer change surface and lower maintenance risk
- clearer request lifecycle and route ownership
- consistent UserRoutes-style auth, guard, DB, ownership, router, and service boundaries
- stronger object-level authorization for pet-owned data
- Zod-backed request validation and stable `errorKey` responses
- local SAM integration coverage for the complete active route surface

Main non-goal in this stage:

- this was not a frontend-facing API cleanup
- this was not a database redesign
- this was not a split into multiple Lambdas
- this was not a guarantee of atomic duplicate prevention without database unique indexes
- this was not a production latency claim based on SAM local timings

## Architecture Changes

- `index.js` remains the AWS entrypoint, but active orchestration is delegated into `src/handler.js`
- request dispatch is centralized in `src/router.js` using exact keys in the format `{HTTP_METHOD} {event.resource}`
- route modules are loaded lazily to reduce unnecessary cold-start work for unrelated paths
- business workflows are split into service files under `src/services/`
- shared infrastructure and helpers are moved into `src/config/`, `src/utils/`, and `src/middleware/`
- database connection reuse is centralized in `src/config/db.js`
- environment validation is performed at Lambda startup through `src/config/env.js`
- localized response lookup is centralized through shared response/i18n utilities

Current module layout:

```text
index.js                           -> thin Lambda entrypoint
src/handler.js                     -> lifecycle orchestration
src/cors.js                        -> origin-validated CORS
src/router.js                      -> exact method/resource dispatch with lazyRoute()
src/config/db.js                   -> singleton MongoDB connection, maxPoolSize: 1, guarded model registration
src/config/env.js                  -> Zod env validation at cold start
src/middleware/authJWT.js           -> HS256 JWT verification and non-production JWT_BYPASS guard
src/middleware/guard.js             -> JSON parse, empty-body checks, ObjectId checks, NGO RBAC
src/middleware/ownership.js         -> DB-backed pet ownership enforcement
src/services/detailInfo.js          -> GET/POST detail info
src/services/transfer.js            -> POST/PUT/DELETE transfer records
src/services/ngoTransfer.js         -> PUT NGO transfer
src/services/source.js              -> GET/POST/PUT source v2
src/services/adoption.js            -> GET/POST/PUT/DELETE adoption v2
src/utils/*                         -> response, logging, validation, sanitization, i18n, duplicate checks
src/zodSchema/*                     -> route and env schemas
src/models/*                        -> Pet, User, PetSource, PetAdoption schemas
src/locales/*                       -> localized error messages
```

The active request lifecycle is:

1. OPTIONS preflight
2. JWT authentication
3. cheap guard validation
4. DB connection
5. DB-backed ownership authorization
6. exact route dispatch
7. service execution
8. structured catch-all error handling

## Functional Improvements

- SAM local routing was aligned with the active router so local API testing matches the current code path
- all 13 active routes are now represented in an exact router table
- detail-info reads and writes return a stable `{ success: true, ... }` shape
- transfer lifecycle routes now use guarded writes and verify write outcomes
- NGO transfer now validates both target email and phone and requires both to resolve to the same user
- NGO transfer optional `transfer.0.*` fields are conditional and no longer clobber existing values when omitted
- source v2 and adoption v2 creation now return `409` for duplicate records instead of creating duplicates in normal request flow
- source v2 and adoption v2 updates now scope writes by both record id and `petId`
- adoption reads use an explicit projection instead of returning broad documents
- unsupported methods that reach the Lambda router return `405 others.methodNotAllowed`

## Validation And Error Handling Improvements

- request validation is standardized through Zod across all active create/update services
- Zod v4 error handling uses the shared `getFirstZodIssueMessage` helper
- malformed JSON request bodies are rejected at the guard layer with `400 common.invalidJSON`
- empty POST/PUT bodies are rejected at the guard layer with `400 others.missingParams`
- invalid `petID`, `transferId`, `sourceId`, and `adoptionId` path parameters are rejected before service execution
- all create/update request bodies are Zod-validated before service DB lookups or writes
- empty Zod-stripped updates return `400 noFieldsToUpdate` domain errors
- DD/MM/YYYY, YYYY-MM-DD, and supported ISO timestamp inputs are calendar-strict
- malformed ISO suffixes and out-of-range time fields are rejected
- internal errors return centralized `others.internalError` responses instead of leaking raw exception messages

Examples verified during local testing:

- invalid ObjectId path params return `400`
- malformed JSON returns `400`
- invalid date values such as junk ISO suffixes return `400`
- duplicate source/adoption creation returns `409`
- nonexistent transfer/source/adoption updates and deletes return `404`
- allowed CORS preflight returns `204`
- disallowed or missing-origin preflight returns `403`

## Security Improvements

- all non-OPTIONS routes are protected by JWT verification; `PUBLIC_RESOURCES = []`
- JWT verification pins HS256 and rejects missing, malformed, expired, wrong-secret, and `alg:none` tokens
- DB-backed ownership checks were introduced for pet-owned routes through `src/middleware/ownership.js`
- ownership checks require either `pet.userId === event.userId` or `pet.ngoId === event.ngoId`
- NGO transfer RBAC is enforced in `src/middleware/guard.js` before DB access
- NGO transfer target lookup uses a single neutral missing-user response to avoid email/phone enumeration
- NGO transfer cross-validates that email and phone resolve to the same target `_id`
- service writes use Zod-parsed allowlisted fields instead of raw request body spreading
- Pet collection mutations include `deleted: false` where the Pet document is mutated
- transfer update/delete writes include the embedded `transfer._id` predicate
- source/adoption update and delete writes include `petId` to prevent cross-pet record mutation
- guarded writes check `matchedCount` or `deletedCount` and return `404` on no match
- source/adoption duplicate checks use the shared `checkDuplicates()` helper from the UserRoutes standard
- response payloads use projections and sanitizers instead of returning raw broad DB documents
- route dispatch uses exact keys instead of fuzzy string matching

## Performance And Maintainability Improvements

- router lazy-loading avoids loading every service on every invocation
- singleton MongoDB connection reuse avoids repeated connection setup
- constrained MongoDB pool sizing reduces Lambda-side connection pressure
- guard validation rejects malformed requests before service logic and before avoidable DB work where possible
- `.select()` projections and sanitizers reduce outbound payload risk and review burden
- shared validators and duplicate-check helpers reduce duplicated route-specific logic
- service modules now have narrower ownership and are easier to review independently

## Local Testing Completed In This Stage

- `template.petdetailinfo.yaml` and SAM routing were used for the active PetDetailInfo path set
- local SAM integration testing was performed against the active handler/router flow
- tests exercised CORS, JWT auth, guard validation, ownership, service validation, lifecycle writes, duplicate handling, response shape, NoSQL injection guards, and cleanup
- invalid validation paths were re-tested after rebuild and confirmed to return stable `400`/`409`/`404` responses
- CORS preflight was verified for allowed, disallowed, and missing-origin requests

## Integration Test Suite

82 end-to-end integration tests were written and passed against SAM local.

Test coverage by area:

- OPTIONS preflight: 5 tests covering allowed origin, disallowed origin, missing origin, and v2 route preflights
- JWT authentication: 6 tests covering missing header, expired token, garbage token, wrong secret, `alg:none`, and missing Bearer prefix
- guard path validation: 4 tests covering invalid `petID`, `transferId`, `sourceId`, and `adoptionId`
- guard body validation: 5 tests covering malformed JSON and empty POST/PUT bodies
- ownership: 5 tests covering stranger denial on detail-info, transfer, source, and adoption routes
- detail info: 15 tests covering read/update, nonexistent pet, date validation, `motherParity` coercion, Zod rejection, and unknown-field stripping
- transfer lifecycle: 8 tests covering create, date validation, update, Zod-before-DB behavior, nonexistent update, delete, and delete `matchedCount`
- NGO transfer: 4 tests covering non-NGO denial, invalid email, invalid phone, and missing required fields
- source v2 lifecycle: 9 tests covering read, create, duplicate `409`, missing required fields, update, invalid update, empty update, nonexistent update, and returned `sourceId`
- adoption v2 lifecycle: 11 tests covering read, create, duplicate `409`, invalid date create/update, update, invalid update, nonexistent update, returned `adoptionId`, delete, and nonexistent delete
- unsupported methods: 2 tests documenting SAM/API Gateway `403` behavior for undeclared routes
- response shape: 2 tests covering error and success response shape
- NoSQL injection prevention: 2 tests covering operator-shaped path/body payloads
- cleanup: 4 tests restoring detail-info and removing test transfer/adoption/source records

Latest verified run:

```text
PASS  __tests__/test-petdetailinfo.test.js (114.624 s)
Test Suites: 1 passed, 1 total
Tests:       82 passed, 82 total
```

---

## Constraints And Deferred Work

This stage intentionally respected the following constraints:

- no intentional frontend API contract changes
- no endpoint removals or route renames
- no database index creation or schema redesign because database control is limited
- no split into multiple Lambdas yet
- no production latency claims based on SAM local timings

Deferred item:

- unique indexes on `pet_sources.petId` and `pet_adoptions.petId` are still required to close the theoretical concurrent-create race window for source/adoption records

## Result Of This Stage

This refactor stage was a contract-preserving stabilization pass and a targeted security hardening effort.

On the structural side, PetDetailInfo is now easier to reason about, safer to modify incrementally, easier to test locally, and less likely to hide logic regressions inside one oversized file.

On the security side, the major code-owned risks identified during the PetDetailInfo audit were addressed. This includes closing gaps around missing object-level ownership enforcement, NGO transfer RBAC, target-user enumeration, email/phone identity mismatch, date parsing ambiguity, duplicate source/adoption records in normal request flow, TOCTOU-prone write predicates, broad response projection, and empty stripped-update writes. Each fix is covered by route-level implementation review and the 82-case SAM integration suite.

The one remaining open item is database-level unique indexes on `pet_sources.petId` and `pet_adoptions.petId`, which would eliminate a theoretical race-condition window during concurrent source/adoption creation. This is a database-level change deferred due to current schema control constraints.

The system is not fully re-architected yet, but it is in a materially better and demonstrably safer state for continued cleanup, logic testing, and future route-by-route hardening.
