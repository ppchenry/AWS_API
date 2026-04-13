# Monorepo Refactor Report (2026-04-13)

## Overview

The first refactor stage of the monorepo modernization effort has now completed 3 Lambdas in place:

* `functions/UserRoutes`
* `functions/PetBasicInfo`
* `functions/EmailVerification`

This work sits inside the broader monorepo cleanup described in [README.md](README.md), follows the modernization baseline in [dev_docs/REFACTOR_CHECKLIST.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/REFACTOR_CHECKLIST.md), and is prioritized using [dev_docs/LAMBDA_REFACTOR_INVENTORY.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/LAMBDA_REFACTOR_INVENTORY.md).

The current verified outcome is:

* `UserRoutes`: **102 / 102 tests passed**
* `PetBasicInfo`: **36 passed, 1 skipped by fixture / 37 reachable**
* `EmailVerification`: **30 / 30 tests passed**
* Combined: **168 passed + 1 optional lifecycle test skipped**

The current verified outcome now also includes live deployed checks for `EmailVerification`:

* `POST /account/generate-email-code` succeeded against the deployed Dev API Gateway and delivered a real verification email
* `POST /account/verify-email-code` succeeded against the deployed Dev API Gateway and returned JWT plus refresh-cookie contract fields

This means the refactoring effort is already producing measurable improvements in security, correctness, maintainability, and runtime behavior without introducing large frontend contract changes.

The biggest improvement so far is security hardening. This refactor stage did not just clean up code structure. It directly reduced exploitability in three high-value Lambda surfaces already modernized.

For non-technical stakeholders, the important point is this: this work was not optional cleanup. It removed weaknesses that could have allowed unauthorized data access, unauthorized account or pet deletion, account takeover, sensitive data leakage, brute-force abuse, and route-level authorization bypass. In a startup environment, those are not theoretical engineering concerns. They are business risks that can turn into customer-impacting incidents, emergency hotfixes, support burden, reputational damage, and loss of trust.

---

## Monorepo Status As Of 2026-04-13

The monorepo started from a legacy state where many Lambdas duplicated helpers, mixed routing and business logic in the same file, and were difficult to evolve safely. The current direction is not a full re-architecture yet. It is a controlled in-situ modernization pass designed to stabilize each Lambda one by one.

As of 2026-04-13, the program now has:

* 3 modularized reference Lambdas
* a written modernization standard
* a line-count and risk-based Lambda inventory
* integration-test-backed verification for the first completed targets
* a repeatable refactor pattern for the remaining Lambdas

The three completed Lambdas now act as the implementation baseline for the remaining 25-Lambda refactor program.

By Lambda count, **3 of 25** Lambdas currently present in this workspace are now at the new hardened baseline. That is roughly **12%** of the Lambda fleet. The program is still early, but the hardened reference surface is now broader than the initial two-Lambda baseline.

That also means the completed work should be seen as high-leverage groundwork, not as isolated refactoring. These first 3 Lambdas establish the secure pattern, the test strategy, and the operational standard that the remaining Lambdas can now follow.

---

## Security Risk Snapshot

The strongest message from this refactor stage is this: the legacy monolith pattern is not only a maintainability problem. It is an active security risk.

Based on the confirmed legacy findings in `UserRoutes`, `PetBasicInfo`, and the strict re-audit of `EmailVerification`, the kinds of cyberattacks that can occur at any time in unmodernized legacy Lambdas, where the same coding patterns still exist, include:

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

These attack classes are not hypothetical. They are derived from vulnerabilities already confirmed in the legacy versions of the two refactored Lambdas.

Put simply: if similar legacy patterns exist in the remaining Lambdas, then the platform is exposed to exploitable weaknesses right now until each surface is reviewed and hardened.

---

## Rough Hardening Coverage

There are two different ways to measure progress, and they should not be confused.

### 1. Coverage inside the 2 refactored Lambdas

For the two Lambdas already modernized, the hardening coverage is high.

* `UserRoutes` documented **19 legacy security findings**, and its changelog states those legacy findings were addressed in this refactor stage
* `PetBasicInfo` documented **13 legacy security findings** across auth, ownership, destructive operations, route matching, sanitization, and error handling

Taken together, that is **32 documented legacy security findings** directly addressed across the first 2 completed Lambdas, plus a completed strict modernization and test pass for `EmailVerification` that closed its major legacy auth and verification-flow risks.

A more defensible rough estimate is that **around 75% to 85% of the known code-owned attack surface identified in the first 2 audited Lambdas, plus the core public verification attack surface in `EmailVerification`, has now been meaningfully hardened**.

This is intentionally conservative and not stated as a hard 100%, because some residual risk is still outside pure handler hardening, for example:

* infra-owned race-condition protection that depends on DB indexes
* future regressions if later edits bypass the new patterns
* risks in neighboring Lambdas that call related data or flows but are not modernized yet
* untested edge cases and unknown-unknowns that were not part of the legacy audit findings list

### 2. Coverage across the whole monorepo

At the monorepo level, the hardening is still early.

* **3 of 25** Lambdas in the current workspace have been modernized to the new baseline
* that means roughly **12%** of the Lambda fleet has received this full hardening treatment so far
* roughly **88%** of Lambdas still require the same route-by-route security verification and refactor discipline

So the correct interpretation is:

* inside the 3 completed Lambdas, most of the known code-owned attack classes on those surfaces have been handled
* across the whole monorepo, the modernization program is still in an early phase and broad residual risk remains until more Lambdas are refactored

For management, this should be read as risk retirement in progress. This refactor stage did not finish the security program, but it already removed a meaningful amount of immediately actionable risk from 3 important production surfaces.

---

## What Was Improved In The 2 Refactored Lambdas

### 1. Security Vulnerabilities Patched

The refactors closed concrete legacy risks documented in [functions/UserRoutes/SECURITY.md](functions/UserRoutes/SECURITY.md), [functions/PetBasicInfo/SECURITY.md](functions/PetBasicInfo/SECURITY.md), and the EmailVerification re-audit/test work summarized in [dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md](dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md).

From a security perspective, the practical effect is that the two refactored Lambdas are now significantly harder to exploit through the most common API attack paths: broken auth, ownership bypass, mass assignment, route confusion, brute-force abuse, enumeration, and sensitive data leakage.

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
* stronger refresh-cookie scoping aligned to `/auth/refresh`
* exact-route dispatch and public-route allowlisting
* rate limiting on both generate and verify flows
* deployment-verified generate and verify behavior through the real Dev API Gateway

These security fixes are backed by the integration results summarized in [dev_docs/test_reports/USERROUTES_TEST_REPORT.md](dev_docs/test_reports/USERROUTES_TEST_REPORT.md), [dev_docs/test_reports/PETBASICINFO_TEST_REPORT.md](dev_docs/test_reports/PETBASICINFO_TEST_REPORT.md), and [dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md](dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md).

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

Both refactored Lambdas now follow a consistent lifecycle:

* handler orchestration
* CORS preflight
* JWT auth
* guard validation
* DB bootstrap
* exact route dispatch
* service execution
* centralized response building

This gives engineers a predictable structure across Lambdas and reduces the risk of future regressions caused by editing large monolithic files. Responsibilities are now split across focused modules such as `handler.js`, `router.js`, middleware, services, response helpers, and sanitize utilities.

That improves:

* readability
* testability
* reviewability
* onboarding speed
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

As of 2026-04-13, the monorepo refactor effort has already produced 3 strong reference implementations, 168 passing integration tests plus 1 optional fixture-gated test, and a verified pattern for continuing the remaining Lambda modernization work.

The completed refactors show clear improvement across:

* security
* performance
* maintainability
* scalability
* stability

Most importantly, they demonstrate why in-situ modernization is the right first step for a 26-Lambda legacy system: it enables one-by-one replacement, avoids downtime, minimizes frontend disruption, and steadily improves the codebase before a later full-scale DDD re-architecture.

This is not the end-state architecture yet, but it is the correct and necessary foundation for getting there safely.

If the objective is to protect the business while continuing to ship, this 2026-04-13 report should be evaluated as early security risk reduction with compounding engineering payoff, not as time spent on cosmetic refactoring.
