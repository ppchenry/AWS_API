# CHANGELOG

## Scope

- Refactored `OrderVerification` Lambda from a monolithic entrypoint into Tier 1 modular architecture.
- Preserved route surface and core business intent for all existing endpoints.
- Added a focused executable Jest baseline for handler lifecycle, ownership boundaries, schema contracts, and DB read projections.

## Architecture Changes

- Added thin `index.js` delegating to `src/handler.js`.
- Added lifecycle orchestration in `src/handler.js`: OPTIONS -> auth -> guard -> DB -> router -> service.
- Added exact-route dispatcher in `src/router.js` with explicit frozen delete route returning 405.
- Split config, middleware, services, schemas, models, and utilities into dedicated modules.

## Functional Improvements

- Standardized all responses through `createSuccessResponse`/`createErrorResponse` with consistent shape.
- Added strict JWT middleware for all non-OPTIONS routes.
- Added request guard for malformed JSON while preserving multipart supplier updates, plus route-level path validation for `_id`.
- Added schema-driven validation for PUT update payloads.
- Added DB-backed ownership enforcement on supplier-facing flows using the linked order email and JWT email claim, with `admin`/`developer` bypass.

## Validation And Error Handling Improvements

- Malformed JSON now returns 400 with `others.invalidJSON` instead of generic 500.
- Missing required path params now return 400 with domain error keys.
- Duplicate order id updates now return 409 with `orderVerification.errors.duplicateOrderId`.
- Invalid `verifyDate` input now returns 400 instead of silently clearing the field.
- Empty supplier multipart updates now return 400 instead of a no-op success.
- WhatsApp provider failures are now logged without falsely reporting overall route failure after a successful DB update.
- Missing `WHATSAPP_BEARER_TOKEN` no longer fails cold start; notification dispatch now degrades gracefully as the service already intended.
- Service-level catch blocks now log structured errors and return `others.internalError`.

## Security Improvements

- Introduced JWT verification with explicit HS256 algorithm.
- Added DB-backed ownership checks for supplier-facing read/update routes instead of trusting caller-supplied identifiers alone.
- Attached JWT email claims for downstream ownership checks and structured logs.
- Removed fuzzy route matching and replaced with exact route keys based on `event.resource`.
- Added allowlist-based output sanitization before entity payload responses.
- Supplier-side `petContact` updates are now bound to the verification record resolved from the path lookup rather than a caller-controlled `orderId`.
- Removed `staffVerification` from client-submittable schemas and update allowlists.
- Added explicit 405 freezing for deprecated/unsupported DELETE route.

## Performance And Maintainability Improvements

- Added singleton DB connection with `maxPoolSize: 1` and connection promise caching.
- Added lazy route loading to reduce cold-start work per invocation.
- Centralized logging with structured JSON entries for CloudWatch triage.
- Centralized locale-backed error translation resolution.
- Added runnable OrderVerification Jest coverage (removed with intention).

## Constraints And Deferred Work

- `infra-owned`: enforce MongoDB unique index for `orderVerification.orderId` to remove race window fully.
- `code-owned`: any future route-tier RBAC matrix is deferred until explicitly approved and regression-tested against the legacy contract.
- `code-owned`: evaluate whether WhatsApp link endpoint should remain protected or become a constrained public route.
- `code-owned`: a focused Jest regression baseline now exists, but a live SAM/integration suite at the UserRoutes breadth is still not in place.

## Result Of This Stage

- Lambda now follows the UserRoutes-style lifecycle and modular separation baseline.
- Security and error handling posture is materially stronger while preserving API path contracts.
- Executable regression coverage now exists for core handler, guard, schema, and projection behaviors.
- Remaining risk is documented explicitly as deferred work items.
