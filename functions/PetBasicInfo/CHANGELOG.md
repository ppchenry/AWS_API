# PetBasicInfo Lambda — Refactoring Changelog

## Scope

Modernized `functions/PetBasicInfo` to the same runtime standard as `functions/UserRoutes` for request lifecycle, JWT handling, structured responses, ownership enforcement, sanitization, and integration testing.

This refactor covered:

- thin `index.js` entrypoint
- `src/handler.js` orchestration
- explicit `src/router.js` route dispatch
- fail-fast env validation and singleton DB bootstrap
- centralized auth, guard, self-access, response, logging, i18n, and rate-limit utilities
- modular services for basic info and eye log flows
- PetBasicInfo integration coverage under `__tests__/test-petbasicinfo.test.js`

This refactor did not redesign the API contract, change persistence shape, or add new business features.

## Architecture Changes

### Before

- one large `index.js` mixed routing, validation, DB access, and business logic
- JWT auth was present in code but not consistently enforced
- response formatting and field filtering were inline and route-specific
- unsupported routes depended on SAM behavior rather than consistent Lambda-level `405`

### After

```text
index.js
  -> src/handler.js
     -> src/cors.js
     -> src/middleware/authJWT.js
     -> src/middleware/guard.js
     -> src/config/db.js
     -> src/router.js
        -> src/services/basicInfo.js
        -> src/services/eyeLog.js
           -> src/middleware/selfAccess.js
           -> src/utils/rateLimit.js (DELETE only)
           -> src/utils/response.js
           -> src/utils/logger.js
```

Key structural changes:

- body parsing and ObjectId validation now happen before the DB connection is opened
- DB-backed pet existence and ownership checks moved into `selfAccess.loadAuthorizedPet()` so DELETE can rate-limit before pet lookup
- the router now does exact `${event.httpMethod} ${event.resource}` matching
- SAM explicitly exposes `POST /pets/{petID}/basic-info` so the Lambda can return `405 methodNotAllowed`

## Functional Improvements

- All routes are now protected by JWT except OPTIONS preflight.
- JWT verification explicitly pins `algorithms: ["HS256"]` to block `alg:none` and algorithm-substitution attacks.
- GET responses sanitize the pet document through an explicit allowlist before returning it.
- Eye log responses sanitize records and limit results to 100 items.
- DELETE applies Mongo-backed rate limiting before pet lookup.
- Missing and soft-deleted pets now return the same `petBasicInfo.errors.petNotFound` response, preventing deletion-state enumeration.
- PUT validation now emits locale dot-keys directly from the schema for both unknown-field and known type-mismatch cases.

## Validation And Error Handling Improvements

- malformed JSON returns `400 petBasicInfo.errors.invalidJSON`
- empty PUT/POST body returns `400 petBasicInfo.errors.emptyUpdateBody`
- invalid `petID` format returns `400 petBasicInfo.errors.invalidPetIdFormat`
- unsupported update fields such as `tagId`, `ngoPetId`, `owner`, or `ngoId` return `400 petBasicInfo.errors.invalidUpdateField`
- all catch blocks log via `logError` and return `createErrorResponse(500, "others.internalError", event)`
- all success and error responses now include consistent CORS handling and response shape

## Security Improvements

- Enforced JWT auth before protected logic.
- Added owner-or-NGO self-access enforcement for GET, PUT, DELETE, and eyeLog routes.
- Pinned JWT verification to HS256.
- Centralized response sanitization to prevent leakage of `deleted`, `__v`, and future internal fields.
- Added DELETE rate limiting via the `RateLimit` collection.
- Added uniform `404` behavior for missing and soft-deleted pets.
- Added exact-route `405` behavior for unsupported `POST /pets/{petID}/basic-info`.

## Performance And Maintainability Improvements

- Singleton MongoDB connection with `maxPoolSize: 1` and promise caching.
- `lazyRoute()` dispatch so only the requested service module is loaded on demand.
- `.lean()` used for read-only pet and eye log fetches.
- locale files cached per container through `i18n.js`.
- service responsibilities split cleanly between `basicInfo.js` and `eyeLog.js`.

## Constraints And Deferred Work

- `infra-owned`: no DB unique index work was added in this refactor; any uniqueness race safety would require Atlas index changes.
- `code-owned`: `README.md`, `API.md`, and shared test reporting must stay aligned with future route or validation changes.
- `code-owned`: the delete lifecycle test still requires a separate disposable pet fixture if full 37/37 mutation coverage is needed in local runs.

## Result Of This Stage

PetBasicInfo now matches the UserRoutes security baseline for the surfaces it owns: JWT auth, ownership enforcement, structured responses, sanitization, fail-fast env validation, exact route dispatch, and integration-test coverage. Remaining work is documentation upkeep and optional fixture management, not runtime hardening.
