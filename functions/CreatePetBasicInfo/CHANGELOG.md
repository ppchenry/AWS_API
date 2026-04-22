# CreatePetBasicInfo Lambda — Refactoring Changelog

## Scope

Modernized `functions/CreatePetBasicInfo` to the same security baseline used by the hardened lambdas in this monorepo, while keeping the route itself focused on a single create workflow.

This refactor covered:

- thin `index.js` entrypoint
- `src/handler.js` lifecycle orchestration
- centralized auth, guard, response, logging, i18n, rate-limit, env, and DB modules
- exact-route dispatch for the single POST endpoint
- schema-based request validation and sanitized success output

This refactor did not add new business features, redesign the pet document model, or introduce new API routes.

## Architecture Changes

### Before

- one large `index.js` mixed body parsing, DB bootstrap, validation, business logic, translations, and response formatting
- the route trusted caller-supplied `userId` directly from the JSON body
- every response used permissive `*` CORS and ad hoc JSON shapes
- the lambda had no JWT protection, no rate limiting, and no structured logs

### After

```text
index.js
  -> src/handler.js
     -> src/cors.js
     -> src/middleware/authJWT.js
     -> src/middleware/guard.js
     -> src/config/db.js
     -> src/router.js
        -> src/services/createPet.js
           -> src/zodSchema/createPetSchema.js
           -> src/utils/response.js
           -> src/utils/logger.js
           -> src/utils/rateLimit.js
           -> src/utils/sanitize.js
```

Key structural changes:

- request lifecycle is now explicit: OPTIONS -> JWT -> cheap guard -> DB -> route -> service
- environment validation now fails fast at cold start instead of surfacing later as runtime errors
- DB connection reuse now uses a promise-cached singleton with `maxPoolSize: 1`
- business logic is isolated to a dedicated create service instead of being embedded in the entrypoint

## Functional Improvements

- `POST /pets/create-pet-basic-info` now requires a valid JWT.
- Pet ownership is now derived from `event.userId` from the JWT, not from a trusted body field.
- Client-supplied `userId` is now rejected at validation time and never influences create ownership.
- Duplicate `tagId` checks now return structured `409` conflict responses.
- Success responses now return a standardized shape with `success: true`, a translated message, the new pet id, and a sanitized result object.

## Validation And Error Handling Improvements

- malformed JSON now returns `400 others.invalidJSON`
- empty request bodies now return `400 others.missingParams`
- missing required fields now return `400 missingName`, `missingBirthday`, `missingSex`, or `missingAnimal`
- invalid dates, booleans, weight, tag identifiers, and image URLs now fail before business logic reaches MongoDB
- all major failures now use `createErrorResponse()` and include `success`, `errorKey`, `error`, and `requestId`
- all catch blocks log structured JSON and return `500 others.internalError`

## Security Improvements

- Added JWT auth before service execution.
- Pinned JWT verification to `HS256`.
- Closed horizontal privilege escalation by removing body-trusted ownership.
- Removed permissive `z.any()` validation for persisted/queryable fields such as `tagId`.
- Added rate limiting to the create flow.
- Added exact route dispatch instead of a monolithic entrypoint path.
- Added sanitized success payloads and removed permissive raw response building.

## Performance And Maintainability Improvements

- reused Mongoose connection with `connPromise` guard to avoid duplicate concurrent cold-start connects
- cached locale files per container
- lazy-loaded service module through `router.js`
- isolated validation and translation logic into dedicated utilities and schemas

## Constraints And Deferred Work

- `infra-owned`: duplicate-prevention race windows still require a MongoDB unique index on `tagId` to be fully eliminated
- `code-owned`: route-level integration tests still need to be added for this lambda specifically
- `code-owned`: if clients still depend on the unauthenticated legacy behavior, they must be updated to send JWTs

## Result Of This Stage

CreatePetBasicInfo now matches the monorepo’s hardened request lifecycle for the surface it owns: fail-fast env validation, exact auth ordering, standardized responses, structured logs, rate limiting, DB reuse, and JWT-based ownership enforcement. Remaining work is mostly test coverage and any infra index changes, not baseline security hardening.

## Security Audit Results

| Item | Status | Notes |
| --- | --- | --- |
| C1 | FIXED | Route now requires `authJWT` before service execution. |
| C2 | FIXED | Success payload returns `sanitizePet(pet)`. |
| C3 | FIXED | Body `userId` is rejected and JWT caller identity is the only ownership source. |
| C4 | NOT APPLICABLE | This lambda has no delete route. |
| C5 | NOT APPLICABLE | This lambda does not manage auth sessions or deletion flows. |
| C6 | NOT APPLICABLE | No upsert-based record creation flow exists here. |
| C7 | NOT APPLICABLE | No public lookup flow exists here. |
| C8 | NOT APPLICABLE | No verification or code-dispatch endpoint exists here. |
| H9 | NOT APPLICABLE | The current create surface no longer accepts client-controlled privilege fields. |
| H10 | FIXED | Service reads ownership from JWT, not request body. |
| H11 | FIXED | Internal lifecycle fields are not accepted in the allowlist schema. |
| H12 | FIXED | Sanitizer strips internal fields before returning the created pet. |
| H13 | NOT APPLICABLE | The current route has no role-restricted sub-surface beyond authenticated access. |
| M14 | FIXED | Create flow now uses Mongo-backed rate limiting. |
| M15 | FIXED | Catch blocks log internally and return `others.internalError`. |
| M16 | FIXED | All responses use `createErrorResponse` or `createSuccessResponse`. |
| M17 | NOT APPLICABLE | This lambda has no delete or token-revocation flow. |
| S18 | FIXED | Route dispatch uses exact `${event.httpMethod} ${event.resource}` matching. |
| S19 | FIXED | Business logic moved out of `index.js` into handler and service modules. |
| I20 | DEFERRED (infra-owned) | Conflict checks are still application-level until unique indexes are enforced in MongoDB. |
