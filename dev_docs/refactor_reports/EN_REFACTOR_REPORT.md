# Monorepo Refactor Report (2026-04-19)

## Overview

The first refactor stage of the monorepo modernization effort has now completed 9 Lambdas in place:

* `functions/UserRoutes`
* `functions/PetBasicInfo`
* `functions/EmailVerification`
* `functions/AuthRoute`
* `functions/GetAllPets`
* `functions/PetLostandFound`
* `functions/EyeUpload`
* `functions/PetDetailInfo`
* `functions/purchaseConfirmation`

This work sits inside the broader monorepo cleanup described in [README.md](README.md), follows the modernization baseline in [dev_docs/REFACTOR_CHECKLIST.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/REFACTOR_CHECKLIST.md), and is prioritized using [dev_docs/LAMBDA_REFACTOR_INVENTORY.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/LAMBDA_REFACTOR_INVENTORY.md).

The current test-file-based case inventory is:

* `UserRoutes`: **93 declared integration test cases** in `__tests__/test-userroutes.test.js` plus **6 declared SMS unit test cases** in `__tests__/test-sms-service.test.js` plus **28 declared auth-workflow unit test cases** in `__tests__/test-authworkflow.test.js`
* `PetBasicInfo`: **37 declared integration test cases** in `__tests__/test-petbasicinfo.test.js`
* `EmailVerification`: **30 declared integration test cases** in `__tests__/test-emailverification.test.js`
* `AuthRoute`: **22 declared test cases** in `__tests__/test-authroute.test.js`
* `GetAllPets`: **53 declared integration test cases** in `__tests__/test-getallpets.test.js`
* `PetLostandFound`: **59 declared integration test cases** in `__tests__/test-petlostandfound.test.js`
* `EyeUpload`: **94 declared integration test cases** in `__tests__/test-eyeupload.test.js`
* `PetDetailInfo`: **82 declared integration test cases** in `__tests__/test-petdetailinfo.test.js`
* `purchaseConfirmation`: **65 declared integration test cases** (63 passing, 2 skipped) in `__tests__/test-purchaseconfirmation.test.js`
* Combined: **535 declared integration test cases across the 9 refactored lambdas + 6 declared SMS unit test cases + 28 declared auth-workflow unit test cases**

These counts describe declared cases in test files. They are not, by themselves, a same-day execution transcript.

The current verified outcome also includes live deployed spot checks for `EmailVerification`:

* `POST /account/generate-email-code` succeeded against the deployed Dev API Gateway and delivered a real verification email
* `POST /account/verify-email-code` succeeded against the deployed Dev API Gateway and returned JWT plus refresh-cookie contract fields

This means the refactoring effort is already producing measurable improvements in security, correctness, maintainability, and runtime behavior without introducing large frontend contract changes.

The core account auth flow is now also clearer at the monorepo level:

* `UserRoutes` handles **verification-first registration** (no passwords for regular users), NGO auth, and protected account operations. `POST /account/login`, `PUT /account/update-password`, and `POST /account/login-2` are frozen routes returning `405`
* `EmailVerification` handles public email proof with a **3-branch verify**: (1) authenticated user → link email to account, (2) new user → `{ verified: true, isNewUser: true }`, (3) existing user → auto-login with token
* `AuthRoute` handles refresh-token rotation and access-token renewal


The biggest improvement so far is security hardening. This refactor stage did not just clean up code structure. It materially reduced known exploitability in eight high-value Lambda surfaces already modernized.

For non-technical stakeholders, the important point is this: this work was not optional cleanup. It removed weaknesses that could have allowed unauthorized data access, unauthorized account or pet deletion, account takeover, sensitive data leakage, brute-force abuse, and route-level authorization bypass. In a startup environment, those are not theoretical engineering concerns. They are business risks that can turn into customer-impacting incidents, emergency hotfixes, support burden, reputational damage, and loss of trust.

---

## Monorepo Status As Of 2026-04-19

The monorepo started from a legacy state where many Lambdas duplicated helpers, mixed routing and business logic in the same file, and were difficult to evolve safely. The current direction is not a full re-architecture yet. It is a controlled in-situ modernization pass designed to stabilize each Lambda one by one.

As of 2026-04-19, the program now has:

* 9 modularized reference Lambdas
* a written modernization standard
* a line-count and risk-based Lambda inventory
* integration-test-backed verification for the first completed targets
* a repeatable refactor pattern for the remaining Lambdas

The completed Lambdas now act as the implementation baseline for the remaining inventory-scoped refactor program.

Based on `dev_docs/LAMBDA_REFACTOR_INVENTORY.md`, the official refactor scope is **22** Lambdas (with `adoption_website`, `AuthorizerRoute`, `TestIPLambda`, and `WhatsappRoute` explicitly listed as out-of-plan).

By inventory scope, **9 of 22** Lambdas are now at the new hardened baseline. That is roughly **41%** completed, with **13 of 22** (about **59%**) remaining in-plan work.

For workspace context, there are currently 26 function folders total; using that denominator alone would understate progress because 4 are intentionally excluded from the refactor plan.

That also means the completed work should be seen as high-leverage groundwork, not as isolated refactoring. These first 9 Lambdas establish the secure pattern, the test strategy, and the operational standard that the remaining Lambdas can now follow.

---

## Refactored Auth Cycle

The account session lifecycle is now split across 3 Lambdas with clearer ownership and fewer hidden side effects.

### 1. `UserRoutes` Owns Registration and Protected Account Operations

`UserRoutes` is now the main account-entry Lambda. It handles verification-first registration, NGO registration, and the authenticated account-management surface.

The most important change is the **verification-first flow**: regular users no longer use passwords at all.

For regular users:

* `POST /account/login` is **frozen** and returns `405` — regular users do not log in with credentials
* `PUT /account/update-password` is **frozen** and returns `405` — regular users have no passwords
* `POST /account/login-2` is **frozen** and returns `405`
* `POST /account/register` requires a consumed email or SMS verification code within a 10-minute window
* registration returns `{ userId, role, isVerified, token }` with `201` and an `HttpOnly` refresh cookie
* the full regular-user auth cycle is: **verify email/SMS → register with proof → receive session**

For NGOs:

* `POST /account/register-ngo` creates the NGO user context and issues an NGO-scoped session immediately (NGOs still use passwords)
* later NGO login checks current NGO approval state before issuing a session

When `UserRoutes` does issue a session, the contract is now aligned across the supported paths:

* a short-lived Bearer JWT access token
* a refresh token stored as an `HttpOnly` cookie

### 2. `EmailVerification` Owns Email Proof With 3-Branch Verify

`EmailVerification` is now responsible for public email-code generation and verification.

Its verify endpoint uses a **3-branch flow**:

* **Branch 1 — Authenticated user** (Bearer token present): links the verified email to the caller's existing account
* **Branch 2 — New user** (no account exists for the email): returns `{ verified: true, isNewUser: true }` so the frontend can proceed to registration with the verification proof
* **Branch 3 — Existing user** (account exists, not authenticated): marks the account verified and issues a full session (access token + refresh cookie) as an auto-login

Its role is narrower and safer than the legacy flow:

* generate is public and anti-enumeration hardened
* verify consumes the code atomically to prevent replay
* verify never creates a user account
* on success it routes to the appropriate branch based on authentication state and account existence

This means `EmailVerification` is no longer a simple account-verification mechanism. It is a controlled email-proof step that serves both new and existing users through distinct, well-tested branches.

### 3. `AuthRoute` Owns Refresh Rotation and Renewal Policy

`AuthRoute` is now the dedicated refresh-token Lambda. Its public route `/auth/refresh` authenticates with the refresh-token cookie rather than a Bearer token.

On refresh, it now performs a stricter renewal flow:

* reads the incoming refresh cookie
* hashes and consumes the stored refresh-token record
* rejects missing, malformed, expired, or replayed refresh tokens
* issues a new short-lived access token
* rotates the refresh cookie by minting a new refresh token

For NGO users, refresh also preserves session context and enforces current policy state:

* NGO claims such as `ngoId` and `ngoName` are preserved on the new access token
* refresh is denied when the NGO is no longer approved or active

### 4. End-To-End Session Model

The hardened session lifecycle is now:

1. A user first establishes identity through one of the explicit bootstrap paths:
	email verification (3-branch), SMS verification, or NGO registration/login.
2. For regular users, the frontend uses the verification proof to register (`POST /account/register`), which returns a session.
3. For existing users, email or SMS verification can auto-login directly.
4. Protected routes use the access token through the JWT middleware layer.
5. When the access token expires, the client calls `AuthRoute` to rotate the refresh token and obtain a fresh access token.

Compared with the earlier legacy state, this is a material improvement because passwords are eliminated for regular users, registration requires cryptographic proof of identity ownership, and login/register/refresh now have distinct responsibilities with test-backed behavior.

---

## Security Risk Snapshot

The strongest message from this refactor stage is this: the legacy monolith pattern is not only a maintainability problem. It is an active security risk.

Based on the confirmed legacy findings in `UserRoutes`, `PetBasicInfo`, the strict re-audit of `EmailVerification`, the refresh-session hardening in `AuthRoute`, the ownership/auth hardening in `GetAllPets`, and the full modular separation of `PetLostandFound`, the following attack classes remain plausible in unmodernized legacy Lambdas where similar coding patterns still exist:

* broken authentication attacks, where protected routes can be reached without valid JWT verification
* horizontal privilege escalation / IDOR attacks, where a caller reads or mutates another user's or pet's data by changing a path param or body field
* unauthorized delete operations, where arbitrary accounts or pets can be soft-deleted or hard-deleted without proper ownership checks
* account takeover flows, where unsafe upsert-style registration or deprecated auth variants issue valid tokens to the wrong caller
* account, phone, or entity enumeration attacks, where public endpoints reveal whether a user, phone, or record exists
* brute-force and automation abuse, where login, registration, SMS, or destructive routes can be hammered without rate limiting
* JWT tampering and algorithm-bypass attempts, including expired-token replay, signature tampering, and `alg:none` attacks when verification is weak
* mass-assignment attacks, where callers write internal fields such as `role`, `deleted`, `owner`, `ngoId`, `tagId`, or other governance fields
* sensitive data exposure, where raw DB documents leak password hashes, deleted flags, internal status, or unprojected analysis fields
* NoSQL-style payload abuse, where operator-like objects or unvalidated request structures are accepted into logic that expects trusted scalar values
* session persistence after delete, where deleted accounts remain usable because related tokens are not revoked consistently
* route-confusion attacks, where fuzzy `includes()` matching sends a request to the wrong code path
* cross-origin exposure, where permissive or inconsistent CORS behavior allows sensitive endpoints to be called from unintended origins
* error-message intelligence leakage, where raw validation or exception text reveals implementation details useful for follow-on attacks

These attack classes are evidence-backed: they are derived from vulnerabilities confirmed in legacy versions of already-audited reference Lambdas. Whether each remaining Lambda is affected must still be verified route by route.

Put simply: if similar legacy patterns exist in remaining Lambdas, exploitable weaknesses may still be present until each surface is reviewed and hardened.

---

## Rough Hardening Coverage

There are two different ways to measure progress, and they should not be confused.

### 1. Coverage inside the first completed reference Lambdas

For the first completed reference Lambdas, the hardening coverage is high.

* `UserRoutes` documented **19 legacy security findings**, and its changelog states those legacy findings were addressed in this refactor stage. The auth flow has since been upgraded to **verification-first** (no passwords for regular users, frozen login/password routes returning 405)
* `PetBasicInfo` documented **13 legacy security findings** across auth, ownership, destructive operations, route matching, sanitization, and error handling
* `EmailVerification` completed strict re-audit, **30 / 30 passing** integration tests, and live deployed verification for generate/verify behavior
* `AuthRoute` now has a dedicated **22-case** suite in `__tests__/test-authroute.test.js` covering handler lifecycle, public-resource bypass, JWT middleware branches, NGO-claim token issuance, NGO approval denial, replay rejection, and refresh rotation
* `GetAllPets` now has a dedicated **53-case** integration suite in `__tests__/test-getallpets.test.js` covering public NGO listing, JWT verification, self-access, ownership enforcement, validation, sanitization, and mutation safety
* `PetLostandFound` now has a dedicated **59 / 59 passing** integration suite covering pet-lost/pet-found CRUD, notifications CRUD, CORS preflight, JWT auth, guard validation, self-access enforcement, ownership-guarded delete, rate limiting, and response shape consistency
* `EyeUpload` now has a dedicated **94 / 94 passing** integration suite covering CORS preflight, JWT auth, dead-route dispatch, schema validation, ownership enforcement, NGO authorization branches, upload validation, rate limiting, and fixture-backed pet access checks
* `PetDetailInfo` now has a dedicated **82 / 82 passing** integration suite covering CORS preflight, JWT auth, guard validation, ownership, detail-info, transfer lifecycle, NGO transfer, source/adoption lifecycle, duplicate handling, response shape, NoSQL injection prevention, and cleanup
* `purchaseConfirmation` now has a dedicated **65 declared (63 / 63 passing, 2 skipped)** integration suite covering CORS preflight, JWT auth, public-route bypass, RBAC, guard validation, dead-route dispatch, Zod validation (purchase + email schemas), NoSQL injection, admin pagination, soft-cancel lifecycle, server-authoritative pricing, rate limiting, and response shape consistency

Taken together, that is **32 documented legacy security findings** directly addressed across the first 2 completed Lambdas, plus completed strict modernization and test-backed hardening for `EmailVerification`, `AuthRoute`, `GetAllPets`, `PetLostandFound`, `EyeUpload`, `PetDetailInfo`, and `purchaseConfirmation` covering the public verification, refresh-session, pet-access-control, pet-domain CRUD, pet-upload / analysis, extended pet-detail/source/adoption, and purchase/order-management portions of the platform surface.

A more accurate statement is qualitative rather than percentage-based: **a substantial portion of the known code-owned attack surface identified in the first 2 audited Lambdas, plus the core public verification attack surface in `EmailVerification`, the purchase and order-management surface in `purchaseConfirmation`, has now been meaningfully hardened**.

This is intentionally conservative and not stated as a hard 100%, because some residual risk is still outside pure handler hardening, for example:

* infra-owned race-condition protection that depends on DB indexes
* future regressions if later edits bypass the new patterns
* risks in neighboring Lambdas that call related data or flows but are not modernized yet
* untested edge cases and unknown-unknowns that were not part of the legacy audit findings list

### 2. Coverage across the whole monorepo

At the monorepo level, the hardening is still early.

* **9 of 22** inventory-scoped Lambdas have been modernized to the new baseline
* that means roughly **41%** of the in-plan Lambda fleet has received this full hardening treatment so far
* roughly **59%** of in-plan Lambdas still require the same route-by-route security verification and refactor discipline
* plus **4 workspace Lambdas** are currently tracked as intentionally out-of-plan in the inventory

So the correct interpretation is:

* inside the 9 completed Lambdas, most of the known code-owned attack classes on those surfaces have been handled
* across the whole monorepo, the modernization program is still in an early-to-mid phase and broad residual risk remains until more Lambdas are refactored

For management, this should be read as risk retirement in progress. This refactor stage did not finish the security program, but it already removed a meaningful amount of immediately actionable risk from 9 important production surfaces.

---

## What Was Improved In The Completed Reference Lambdas

### 1. Security Vulnerabilities Patched

The refactors closed concrete legacy risks documented in [functions/UserRoutes/SECURITY.md](functions/UserRoutes/SECURITY.md), [functions/PetBasicInfo/SECURITY.md](functions/PetBasicInfo/SECURITY.md), and the EmailVerification re-audit/test work summarized in [dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md](dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md).

From a security perspective, the practical effect is that the completed reference Lambdas are now significantly harder to exploit through the most common API attack paths: broken auth, ownership bypass, mass assignment, route confusion, brute-force abuse, enumeration, and sensitive data leakage.

This is exactly the kind of work that looks slower than feature shipping in the short term, but prevents much more expensive interruptions later. The alternative is to defer the cleanup until those weaknesses become a production incident.

For `UserRoutes`, the patched issues include:

* missing JWT verification on protected routes
* unauthorized account read, update, and delete paths
* unauthorized soft-delete by email flow
* legacy registration paths that enabled account takeover
* account and phone enumeration through public endpoints
* caller-controlled role assignment at registration
* over-trust in body-provided identity fields
* sensitive lifecycle fields exposed in editable allowlists
* password hash leakage in responses
* missing NGO-only RBAC enforcement
* missing rate limiting on login, registration, and SMS flows
* raw internal error leakage
* inconsistent response format and status handling
* fuzzy route matching with `includes()`
* monolithic handler coupling that made security regressions easy
* **verification-first flow**: `POST /account/login`, `PUT /account/update-password`, and `POST /account/login-2` are now frozen (405), eliminating credential-based attack vectors for regular users

For `PetBasicInfo`, the patched issues include:

* JWT verification path effectively disabled in legacy handler logic
* no pet ownership or NGO access enforcement
* unauthorized delete of arbitrary pets
* unauthorized mutation of governance and ownership-related fields
* unauthorized eye-log access
* deletion-state enumeration via `410` versus `404`
* no rate limiting on destructive delete flow
* inconsistent CORS behavior on sensitive responses
* raw validation and cast error leakage
* missing `errorKey` and `requestId` in error responses
* no centralized sanitization boundary for outbound payloads
* fuzzy route branching via `includes()`
* single-file handler coupling across infra, validation, routing, and business logic

For `EmailVerification`, the hardened flow now includes:

* public-route anti-enumeration on both generate and verify
* no placeholder or pre-verification user creation
* dedicated verification-state storage instead of storing transient codes on `User`
* one-time code consumption with replay prevention
* 3-branch verify: authenticated user → link identifier, new user → `isNewUser: true`, existing user → auto-login with token
* stronger refresh-cookie scoping aligned to `/auth/refresh`
* exact-route dispatch and public-route allowlisting
* rate limiting on both generate and verify flows
* deployment-verified generate and verify behavior through the real Dev API Gateway

For `AuthRoute`, the hardened flow now includes:

* explicit lifecycle ordering: OPTIONS -> authJWT -> guard -> DB -> router
* public-route allowlisting for `/auth/refresh`
* JWT middleware parity with the `UserRoutes` auth contract for protected-route behavior
* refresh-token parsing from cookies with structured 401 responses for missing or malformed cookies
* one-time-use refresh-token consumption to reject replay
* refresh-token rotation with a new `HttpOnly` cookie on success
* preservation of NGO-specific token claims across refresh so NGO sessions are not downgraded after renewal
* handler-level and middleware-level branch coverage for the refresh auth path

For `GetAllPets`, the hardened flow now includes:

* exact route dispatch replacing fuzzy `includes()`-style matching
* explicit JWT protection on mutation routes
* self-access enforcement for user-owned pet listing
* atomic ownership-guarded delete and update flows
* Zod-backed body validation and ObjectId guard checks
* centralized pet sanitization and standardized error responses
* integration coverage across public NGO listing, protected user listing, delete, update, and auth/error paths

For `PetLostandFound`, the hardened flow now includes:

* full modular decomposition from 1089-line monolith to 20+ focused CJS modules
* exact route dispatch with method-level routing for pet-lost, pet-found, and notifications
* JWT auth on all mutation routes with self-access enforcement on notification routes
* ownership-guarded delete for pet-lost and pet-found records
* Zod-backed body and path-param validation with ObjectId guard checks
* rate limiting on pet-lost and pet-found create routes (5 req/60s per user)
* multipart form-data parsing with file size validation (10MB limit)
* S3 image upload with serial number generation
* `mime` v4 ESM-only compatibility fix using dynamic `import()` with lazy caching
* centralized i18n error responses with `errorKey` and `requestId` contract
* CORS preflight with origin validation on all route groups
* integration coverage across all CRUD operations, notifications, auth, guard, rate limiting, and response shape

For `EyeUpload`, the hardened flow now includes:

* full modular separation from a 1000+ line monolith into handler, router, middleware, config, service, utils, and schema modules
* exact route dispatch with explicit `405` handling for legacy dead routes
* JWT-protected create, update, upload, and analysis routes with DB-backed pet ownership enforcement
* schema-backed validation for create, update, and breed-analysis payloads with stable `eyeUpload.*` error keys under Zod 4
* upload allowlisting and folder traversal rejection for pet-breed image storage paths
* per-route Mongo-backed rate limiting across all 6 active routes
* integration coverage across auth, validation, ownership, NGO authorization, upload behavior, dead routes, and response shape

For `PetDetailInfo`, the hardened flow now includes:

* full modular separation from a 1000+ line monolith into handler, router, middleware, config, service, utils, schema, model, and locale modules
* JWT protection on all 13 active routes with `PUBLIC_RESOURCES = []`
* DB-backed ownership enforcement for detail-info, transfer, source, and adoption routes
* guard-layer NGO RBAC for NGO transfer before DB access
* anti-enumeration target-user lookup behavior and email/phone identity cross-validation
* calendar-strict DD/MM/YYYY, YYYY-MM-DD, and ISO timestamp validation
* `checkDuplicates()` based duplicate handling for source/adoption creation with `409` responses
* TOCTOU-resistant write predicates including `deleted:false`, transfer subdocument id checks, source/adoption `petId` scoping, and matched-count verification
* integration coverage across CORS, JWT, guard, ownership, detail-info, transfer, NGO transfer, source, adoption, response shape, NoSQL injection guards, and cleanup

For `purchaseConfirmation`, the hardened flow now includes:

* full modular decomposition from a 1,100-line monolith into 28 single-responsibility CJS modules
* exact route dispatch with dead routes returning 405
* JWT auth on all admin routes with public-route bypass for `POST /purchase/confirmation` and `GET /purchase/shop-info`
* RBAC enforcement for admin-only routes (orders, order-verification, email sending)
* server-authoritative pricing via `shopCode` lookup — client-supplied `price` is never persisted
* Zod-backed validation for purchase multipart fields and email JSON body with locale-key error messages
* unique DB indexes on `Order.tempId` and `OrderVerification.tagId` closing race-condition duplicates
* write atomicity with rollback — failed tag/QR/OV creation after Order save triggers Order cleanup
* soft-cancel idempotency — double-cancel returns 409, not 404
* query projections excluding bank credentials (`bankName`, `bankNumber`) at query time
* per-IP rate limiting on the public purchase endpoint (10 req/hr, fail-closed)
* magic-byte MIME detection replacing `mime-types` package for file uploads
* CORS origin validation with `errorKey` on 403 responses
* HTML email template extraction with user-value HTML escaping
* WhatsApp phone number ID moved from hardcoded string to env var
* integration coverage across CORS, JWT, public routes, RBAC, guard, dead routes, Zod validation, NoSQL injection, admin pagination, soft-cancel lifecycle, purchase flow, rate limiting, and response shape

These security fixes are backed by the integration results summarized in [dev_docs/test_reports/USERROUTES_TEST_REPORT.md](dev_docs/test_reports/USERROUTES_TEST_REPORT.md), [dev_docs/test_reports/PETBASICINFO_TEST_REPORT.md](dev_docs/test_reports/PETBASICINFO_TEST_REPORT.md), [dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md](dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md), [dev_docs/test_reports/AUTHROUTE_TEST_REPORT.md](dev_docs/test_reports/AUTHROUTE_TEST_REPORT.md), [dev_docs/test_reports/GETALLPETS_TEST_REPORT.md](dev_docs/test_reports/GETALLPETS_TEST_REPORT.md), [dev_docs/test_reports/PETLOSTANDFOUND_TEST_REPORT.md](dev_docs/test_reports/PETLOSTANDFOUND_TEST_REPORT.md), [dev_docs/test_reports/EYEUPLOAD_TEST_REPORT.md](dev_docs/test_reports/EYEUPLOAD_TEST_REPORT.md), [dev_docs/test_reports/PETDETAILINFO_TEST_REPORT.md](dev_docs/test_reports/PETDETAILINFO_TEST_REPORT.md), and [dev_docs/test_reports/PURCHASECONFIRMATION_TEST_REPORT.md](dev_docs/test_reports/PURCHASECONFIRMATION_TEST_REPORT.md).

---

### 2. Performance Improvements

The refactors improved runtime efficiency in practical Lambda-specific ways:

* thin `index.js` entrypoints reduce cold-start overhead
* lazy route loading avoids loading unrelated services on every invocation
* singleton MongoDB connection reuse avoids repeated connection cost
* constrained MongoDB pool sizing reduces Lambda-side connection waste
* malformed requests are rejected earlier, before unnecessary DB work
* `.lean()` reads and focused projections reduce Mongoose and query overhead
* cached translation loading avoids repeated filesystem reads

These are not speculative platform claims. They are maintainable runtime improvements that reduce unnecessary work while preserving current API behavior.

---

### 3. Maintainability Improvements

The main maintainability gain is structural clarity.

The completed reference Lambdas now follow a consistent lifecycle:

* handler orchestration
* CORS preflight
* JWT auth
* guard validation
* DB bootstrap
* service execution
* centralized response building

This gives engineers a predictable structure across Lambdas and reduces the risk of future regressions caused by editing large monolithic files. Responsibilities are now split across focused modules such as `handler.js`, `router.js`, middleware, services, response helpers, and sanitize utilities.

That improves:

* readability
* testability
* reviewability
* confidence when changing one route without breaking unrelated behavior

---

### 4. Scalability Improvements

The refactors improve scalability in both codebase and operational terms.

At the codebase level:

* the monorepo now has a reusable Lambda shape that can be repeated consistently
* utilities and patterns are becoming standardized instead of reimplemented ad hoc
* route-level logic is easier to extend without expanding a single god file

At the runtime level:

* DB access is more disciplined
* selective projections reduce unnecessary payload movement
* rate limiting now exists on sensitive flows
* route dispatch is explicit and easier to optimize further later

This is the right type of scalability improvement at the current stage: reducing structural chaos first, before attempting deeper service or domain scaling changes.

---

### 5. Stability Improvements

The refactors improved stability through consistent request handling and stronger failure behavior:

* fail-fast environment validation at startup
* structured logging for production troubleshooting
* uniform success and error response shapes
* better use of 400, 401, 403, 404, 405, 409, 429, and 500 status codes
* sanitized outputs to prevent accidental field leakage
* ownership and role checks moved earlier into predictable control points
* integration tests exercising real request paths through SAM local against UAT MongoDB

This reduces the chance of hidden regressions and makes failures easier to diagnose without reading large handler files line by line.

---

## Why Choose In-Situ Modernization First

The current strategy is to modernize each Lambda in place before attempting a full DDD-style re-architecture.

This is the correct approach for a legacy monorepo of this shape because it gives:

* one-by-one replacement instead of a high-risk big-bang rewrite
* no downtime from wholesale service replacement
* no major frontend contract breakage during the stabilization phase
* immediate all-round improvements in security, validation, observability, and maintainability
* a safer baseline for future architectural decisions

From a security-program perspective, this is also the only realistic way to reduce live risk while keeping the business running. Each Lambda can be hardened and re-verified without waiting for a full platform rewrite.

That matters in a startup because the company usually cannot afford a long freeze, a breaking migration, or a public security incident. In-situ modernization reduces risk while preserving delivery.

In other words, in-situ modernization is the bridge between a fragile legacy codebase and a future domain-driven architecture.

It allows the team to:

* preserve working business behavior where possible
* improve runtime quality immediately
* verify each refactor with tests before moving on
* reduce operational risk while continuing delivery
* avoid mixing architectural redesign with legacy bug discovery in the same step

If the team attempted a full DDD redesign too early, it would be forced to solve legacy ambiguity, hidden contract dependencies, domain decomposition, migration strategy, and regression prevention all at once. That would multiply risk.

By contrast, the current approach first makes the Lambdas understandable, testable, and safe to change. Only after that does a deeper DDD re-architecture become realistic.

---

## Why Refactoring The Full Set May Take Longer

The remaining work may take meaningful time for structural reasons, not because the direction is unclear.

It also takes time because security hardening is not just file reorganization. Each Lambda must be treated as an attack surface, reviewed for broken auth, authorization gaps, input validation drift, data leakage, rate limiting, and route ambiguity before it can be considered safely modernized.

According to [dev_docs/LAMBDA_REFACTOR_INVENTORY.md](dev_docs/LAMBDA_REFACTOR_INVENTORY.md), many Lambdas are still large and tightly coupled, including several handlers above 500 lines and some above 1000 lines. Those Lambdas are likely to contain:

* mixed routing, validation, DB access, and business logic in one file
* duplicated but slightly divergent helper logic
* hidden auth and authorization assumptions
* inconsistent response shapes and error behavior
* legacy frontend dependencies that cannot be broken casually
* data model assumptions that require careful regression testing

Each Lambda therefore needs more than code movement. Safe refactoring requires:

* route mapping
* auth review
* validation tightening
* response normalization
* sanitization review
* rate-limit review where needed
* regression testing
* documentation updates

That takes time because the work is being done in a way that preserves availability and minimizes contract drift.

The goal is not just to “rewrite files.” The goal is to produce Lambdas that are safer, cleaner, and operationally more reliable while remaining compatible with existing consumers.

This is why the work may feel slower than surface-level coding changes: secure modernization requires understanding the real request lifecycle, the actual data exposure risk, the hidden authorization assumptions, and the regression impact before changing anything. That time is not waste. It is what prevents shipping a cleaner-looking system that is still exploitable.

---

## Conclusion

As of 2026-04-19, the monorepo refactor effort has produced 9 strong reference implementations, 535 declared integration test cases across those refactored lambdas plus 6 declared SMS unit test cases and 28 declared auth-workflow unit test cases, and a verified pattern for continuing the remaining Lambda modernization work.

The completed refactors show clear improvement across:

* security
* performance
* maintainability
* scalability
* stability

Most importantly, they demonstrate why in-situ modernization is the right first step for a 26-Lambda legacy system: it enables one-by-one replacement, avoids downtime, minimizes frontend disruption, and steadily improves the codebase before a later full-scale DDD re-architecture.

This is not the end-state architecture yet, but it is the correct and necessary foundation for getting there safely.

If the objective is to protect the business while continuing to ship, this 2026-04-19 report should be evaluated as early security risk reduction with compounding engineering payoff, not as cosmetic refactoring.
