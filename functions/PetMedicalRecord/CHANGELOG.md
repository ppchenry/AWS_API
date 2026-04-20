# PetMedicalRecord - CHANGELOG

## Refactor - In-Situ Modernization (Tier 1 Full Separation)

### Scope

Refactored the monolithic `index.js` into a Tier 1 separated structure aligned to the existing `UserRoutes` implementation and the `REFACTOR_CHECKLIST.md` lifecycle. The Lambda still exposes the same 16 pet-scoped CRUD endpoints for medical, medication, deworm, and blood-test records.

Not changed:
- Mongoose collection names
- Existing route paths
- Existing hard-delete behavior for domain records

### Architecture Changes

Before:
- Single entrypoint mixed routing, auth, validation, DB access, and record logic inline

After:
```text
index.js                          -> thin entry
src/handler.js                    -> lifecycle orchestration (CORS -> Auth -> Guard -> DB -> Route)
src/cors.js                       -> CORS allowlist handling
src/router.js                     -> exact-key route dispatch with lazyRoute()
src/config/env.js                 -> cold-start env validation
src/config/db.js                  -> singleton Mongo connection and model registration
src/middleware/authJWT.js         -> JWT verification and event claim attachment
src/middleware/guard.js           -> JSON parse, empty-body, ObjectId validation
src/middleware/selfAccess.js      -> self-access policy map placeholder plus DB-backed pet authorization helper
src/services/*.js                 -> route business logic by record domain
src/utils/*.js                    -> response, logging, sanitization, validators, i18n, zod helpers
src/zodSchema/*.js                -> strict payload schemas
```

### Functional Improvements

- All routes now execute through the canonical lifecycle: OPTIONS -> authJWT -> guard -> DB -> router -> service.
- Every service now performs DB-backed pet ownership enforcement at service start through `loadAuthorizedPet()`.
- Record update and delete operations are scoped by both record `_id` and `petId`.
- Create and update flows return sanitized persisted documents rather than raw request echoes.
- Update flows now preserve valid falsey values such as `false`, `0`, and empty strings.
- Blood-test flows now maintain pet-level summary fields consistently via `bloodTestRecordsCount` and `latestBloodTestDate`.

### Validation And Error Handling Improvements

- Malformed JSON now returns `400 others.invalidJSON` from the guard layer.
- POST and PUT requests with empty bodies return `400 others.missingParams`.
- Path `petID` and record IDs are validated before service execution.
- Zod schemas are strict, so unknown request fields are rejected instead of silently stripped.
- Services return `400 ...noFieldsToUpdate` when no valid update fields remain.
- ISO `YYYY-MM-DD` and `DD/MM/YYYY` date validation now rejects impossible calendar dates.
- Service catch blocks log structured errors and return `500 others.internalError`.

### Security Improvements

- `C1` fixed: all non-OPTIONS routes pass through JWT auth.
- `C2` fixed: returned record documents are sanitized before response.
- `C3` fixed for this Lambda surface: pet ownership is derived from JWT identity and the loaded pet, not from caller-controlled body fields.
- `C4` fixed for auth/ownership gating: delete routes require JWT and ownership before execution.
- `H10` fixed: edit ownership is based on JWT identity, not request-body identity.
- `M15` fixed: catch blocks do not leak raw error messages.
- `M16` fixed: responses flow through centralized success/error helpers.
- `S18` fixed: route matching uses exact `"${event.httpMethod} ${event.resource}"` keys.
- `S19` fixed: entrypoint is thin and business logic moved under `src/`.
- Structured logging now includes `userEmail` and `userRole` when present in the JWT.

### Performance And Maintainability Improvements

- MongoDB connection reuse follows the singleton + `connPromise` pattern.
- `maxPoolSize: 1` remains enforced for Lambda.
- Route dispatch uses lazy loading so only the requested service module is loaded.
- Read queries use focused projections, including latest-deworm date maintenance reads.
- Responsibilities are split across handler, middleware, router, services, config, and utils.

### Constraints And Deferred Work

- `schema-owned`: delete operations intentionally remain hard delete because the medical-domain record schemas do not expose a `deleted` field for soft-delete semantics. This pass preserves the existing collection contract instead of introducing hidden lifecycle drift.
- `code-owned`: `selfAccess.js` includes an empty opt-in policy map because this Lambda has no DB-free self-access routes; ownership is DB-backed via `loadAuthorizedPet()`.
- `infra-owned`: race-condition-safe duplicate prevention is not applicable here because these record flows do not rely on unique indexed creation semantics.

### Result Of This Stage

PetMedicalRecord now materially improves toward the UserRoutes/checklist baseline with predictable lifecycle ordering, JWT auth, DB-backed ownership enforcement, exact route dispatch, safer validation, better structured logging, sanitized response payloads, explicit `ALLOWED_ORIGINS` env enforcement, and consistent blood-test aggregate maintenance. It should be treated as baseline-ready for this Lambda surface with the documented schema-owned hard-delete exception and the remaining non-blocking implementation notes above.
