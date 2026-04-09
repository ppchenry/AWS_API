# UserRoutes Refactor Changelog

## Scope

This changelog documents the current UserRoutes refactor stage completed after local SAM testing and route-level verification.

This stage was an internal refactor, not an API redesign.

Goals for this stage:

- preserve existing endpoint shapes and request/response contracts where possible
- improve maintainability, security, validation behavior, and local testability
- reduce the operational risk of changing a single large monolithic Lambda file
- avoid database schema changes and frontend contract changes that are outside current control

## Summary Compared To The Old Monolith

The previous implementation concentrated most routing, validation, auth, Twilio, token, and MongoDB logic in one large Lambda entry file.

The current implementation keeps roughly similar overall logic volume, but moves that logic into smaller modules with clearer responsibilities.

Main improvement in this stage:

- safer change surface and lower maintenance risk
- clearer request lifecycle and route ownership
- better local test support through SAM-aligned routing
- more consistent validation and response handling
- targeted security and logic fixes without changing the public contract

Main non-goal in this stage:

- this was not a full domain split into separate Lambdas
- this was not a database redesign
- this was not a frontend-facing API cleanup
- this was not a guaranteed latency reduction for all routes

## Architecture Changes

- `index.js` remains the AWS entrypoint, but active orchestration is now delegated into `src/handler.js`
- route dispatch is centralized in `src/router.js` using the key format `{HTTP_METHOD} {event.resource}`
- route modules are loaded lazily to reduce unnecessary cold-start work for unrelated paths
- business workflows are split into service files under `src/services/`
- shared infrastructure and helpers are moved into `src/config/`, `src/utils/`, and `src/middleware/`
- database connection reuse is centralized in `src/config/db.js`
- environment validation is performed at Lambda startup through `src/config/env.js`

## Functional Improvements

- SAM local routing was aligned with the active router so local API testing matches the current code path
- `POST /account/login-2` now returns a stable `newUser` boolean for existing users
- NGO user listing no longer surfaces deleted users through the aggregate lookup path
- NGO user listing now filters inactive NGO access rows
- `POST /account/delete-user-with-email` now validates request shape and revokes refresh tokens for the deleted user
- `registerNgo` now validates through Zod instead of manual field checks
- `registerNgo` now creates related records inside a MongoDB transaction for better consistency
- refresh-token cookie construction is standardized through shared token helpers
- response translation lookup is centralized in the response helper instead of being passed through the whole request stack

## Validation And Error Handling Improvements

- request validation is standardized through Zod across the active UserRoutes service layer
- Zod v4 error handling was fixed to use `error.issues` semantics through `src/utils/zod.js`
- invalid request bodies that were incorrectly returning `500` now return `400`
- unconfigured Twilio dependencies now return `503` service-unavailable instead of failing deeper in the SMS workflow
- internal errors now consistently use shared `others.internalError` handling instead of leaking inconsistent raw messages

Examples verified during local testing:

- invalid register payloads now return `400` instead of `500`
- invalid SMS payloads now return `400` instead of `500`
- allowed CORS preflight returns `204`
- disallowed or missing-origin preflight returns `403`

## Security Improvements

- self-access checks were introduced for selected user-owned routes through `src/middleware/selfAccess.js`
- JWT-derived identity is now compared against body `userId`, path `userId`, or body `email` for protected self-service flows where applicable
- access token payloads now include `userEmail` to support self-access checks by email
- authentication and response handling now depend less on request-scoped translation objects, reducing coupling in the auth path
- NGO list responses now avoid returning unnecessary lookup payloads by projecting only required fields

## Performance And Maintainability Improvements

- router lazy-loading avoids loading every service on every invocation
- shared helpers reduce duplicated token, validation, and response code
- NGO user-list aggregation was reduced and extracted into `src/services/ngoUserListPipeline.js`
- NGO list lookup stages now project smaller payloads earlier in the aggregation pipeline
- some write paths were simplified to avoid unnecessary parallel query orchestration where it did not help clarity or runtime behavior
- normalization helpers for email and phone now live in one shared utility instead of being duplicated in multiple files

## Local Testing Completed In This Stage

- `template.yaml` was updated to match the current active UserRoutes router paths and methods
- local SAM build and route testing were performed against the active handler/router flow
- response-time checks were run across testable endpoints using safe payloads
- tested local routes clustered around roughly 1 second in SAM, which is acceptable for local Docker-backed testing and did not indicate one obvious route outlier
- `GET /account/user-list`, `GET /account/edit-ngo/{ngoId}`, and `GET /account/edit-ngo/{ngoId}/pet-placement-options` were verified as reachable and logically healthy in local testing
- invalid validation paths for register and SMS routes were re-tested after rebuild and confirmed to return `400`
- CORS preflight was verified to work for configured local origins such as `http://localhost:3000`

## Constraints And Deferred Work

This stage intentionally respected the following constraints:

- no intentional frontend API contract changes
- no endpoint removals beyond continuing to return `405` for deprecated, unimplemented register variants
- no database index creation or schema redesign because database control is limited
- no split into multiple Lambdas yet
- no production latency claims based on SAM local timings

Known constraints that still remain:

- overall total code volume is still substantial; the gain is modularity, not dramatic code reduction
- some broader hardening items are still deferred, including stronger abuse protection for public SMS endpoints
- uniqueness guarantees still depend partly on application logic unless database indexes are enforced externally
- local SAM timings are useful for regressions and outliers, but not for final production performance judgment
- README documentation may still lag behind the now-active handler/router architecture and should be refreshed in a later documentation pass

## Result Of This Stage

This refactor stage should be viewed as a contract-preserving stabilization pass.

Compared with the old monolithic implementation, the main win is that UserRoutes is now easier to reason about, safer to modify incrementally, easier to test locally, and less likely to hide logic regressions inside one oversized file.

The system is not fully re-architected yet, but it is in a materially better state for continued cleanup, logic testing, and future route-by-route hardening.