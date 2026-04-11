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
- targeted security and logic fixes without broad contract churn

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
- specific `template.yaml` routes were reordered ahead of `/account/{userId}` so SAM local does not shadow `user-list` and NGO edit routes behind the generic path
- NGO user listing no longer surfaces deleted users through the aggregate lookup path
- NGO user listing now filters inactive NGO access rows
- `POST /account/delete-user-with-email` now validates request shape and revokes refresh tokens for the deleted user
- `registerNgo` now validates through Zod instead of manual field checks
- `registerNgo` now creates related records inside a MongoDB transaction for better consistency
- regular `register` now always creates `role: "user"` and no longer accepts a caller-controlled role from the request body
- email and phone values are normalized before duplicate checks and persistence in registration and user-update flows
- refresh-token cookie construction is standardized through shared token helpers
- response translation lookup is centralized in the response helper instead of being passed through the whole request stack

## Validation And Error Handling Improvements

- request validation is standardized through Zod across the active UserRoutes service layer
- Zod v4 error handling was fixed to use `error.issues` semantics through `src/utils/zod.js`
- invalid request bodies that were incorrectly returning `500` now return `400`
- malformed JSON request bodies are now explicitly rejected at the guard layer with `400` before route logic executes
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
- NGO access tokens now also include `userRole`, and auth middleware now exposes `ngoId` and `ngoName` on the request event for downstream authorization and audit use
- `editNgo` no longer accepts `deleted` in the NGO user update allowlist, preventing NGO admins from soft-deleting themselves via the edit endpoint
- login and SMS flows now enforce lightweight Mongo-backed rate limiting to reduce brute-force and verification abuse
- register and NGO-register flows now also enforce Mongo-backed rate limiting, closing the remaining unauthenticated abuse gap identified in the audit
- duplicate-conflict handling is now more consistent, with NGO duplicate email, phone, and registration-number failures returning `409`
- deleted-user flows are now regression-tested so stale tokens cannot keep reading deleted profiles and deleted accounts cannot log back in
- SMS code generation now returns a generic success response instead of disclosing whether the phone number already belongs to an existing account
- authentication and response handling now depend less on request-scoped translation objects, reducing coupling in the auth path
- NGO list responses now avoid returning unnecessary lookup payloads by projecting only required fields
- NGO-only authorization is now enforced in `src/middleware/guard.js`, so role checks happen at the guard layer before handler dispatch
- outbound user-shaped responses are now sanitized through `src/utils/sanitize.js` so password hashes are not returned from user detail, NGO detail, or update responses

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

## Integration Test Suite

102 end-to-end integration tests were written and passed against SAM local connected to the UAT MongoDB cluster.

Test coverage by area:

- registration (email): 10 tests including duplicate, missing fields, invalid format, NoSQL-style object rejection, role hardening, and rate limiting
- registration hardening: regular register ignores caller-supplied `role` and rejects duplicate email even when casing differs
- login: 10 tests including wrong password, non-existent user, missing fields, invalid format, malformed JSON, rate limiting, NGO login edge cases, and missing/garbage auth headers
- login-2 deprecation: route returns `405`, with empty-body validation still returning `400`
- get user: 2 tests including self-access enforcement and password redaction
- update user details: 6 tests including missing userId, mismatched userId, invalid email, malformed JSON, and NoSQL-style object rejection
- update password: 4 tests including same password, wrong old password, short new password
- update image: 3 tests including invalid URL, missing userId
- user list: 4 tests including pagination, search, unauthenticated denial, and non-NGO denial
- not-implemented routes: 3 tests confirming 405
- NGO registration: 10 tests including duplicate email, duplicate phone, duplicate business registration, password mismatch, missing fields, invalid phone, cross-flow duplicate protection, NoSQL-style object rejection, and rate limiting
- cross-registration duplicate protection: 1 test
- NGO login: 1 test
- NGO details (GET/PUT): 10 tests including invalid and non-existent ngoId, duplicate email conflict, duplicate registration-number conflict, edit hardening that ignores `deleted`, password redaction, and non-NGO denial
- NGO pet placement options: 5 tests including invalid and non-existent ngoId plus auth denial cases
- delete user by email: 6 tests including sacrificial user lifecycle and double-delete 409
- SMS code generation: 2 tests covering missing and invalid phone
- SMS code verification: 3 tests covering missing code, missing phone, and invalid phone
- security: 13 tests covering tampered JWT, alg:none attack, arbitrary Bearer string, self-access enforcement on all protected mutation routes, duplicate-conflict enforcement, mass assignment prevention, body userId injection on NGO edit, edit hardening, and NoSQL injection via operator objects
- delete user (cleanup): 7 tests including self-access enforcement, invalid path-param handling, deleted-token access failure, deleted-user login failure, and repeat delete behavior

---

## Constraints And Deferred Work

This stage intentionally respected the following constraints:

- no intentional frontend API contract changes
- no endpoint removals beyond continuing to return `405` for deprecated, unimplemented register variants
- no database index creation or schema redesign because database control is limited
- no split into multiple Lambdas yet
- no production latency claims based on SAM local timings

## Result Of This Stage

This refactor stage was a contract-preserving stabilization pass and a targeted security hardening effort.

On the structural side, UserRoutes is now easier to reason about, safer to modify incrementally, easier to test locally, and less likely to hide logic regressions inside one oversized file.

On the security side, all 19 findings identified in the legacy audit were addressed. This includes closing critical gaps such as the complete absence of JWT verification, unauthenticated account deletion and modification, account hijacking via upsert-based registration variants, phone and account enumeration through public endpoints, and caller-controlled role assignment at registration. High and medium severity issues such as password hash exposure in API responses, missing RBAC on NGO-only routes, absent rate limiting on all public flows, and inconsistent error message leakage were also resolved. Each fix is covered by at least one automated integration test.

The one remaining open item is a unique index on the `email` field in the User collection, which would eliminate a theoretical race-condition window during concurrent registration. This is a database-level change deferred due to current schema control constraints.

The system is not fully re-architected yet, but it is in a materially better and demonstrably more secure state for continued cleanup, logic testing, and future route-by-route hardening.