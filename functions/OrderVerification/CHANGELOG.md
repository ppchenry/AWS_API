# CHANGELOG

## Scope

- Refactored `OrderVerification` Lambda from a monolithic entrypoint into Tier 1 modular architecture.
- Preserved route surface and core business intent for all existing endpoints.
- Did not introduce new tests in this stage by request.

## Architecture Changes

- Added thin `index.js` delegating to `src/handler.js`.
- Added lifecycle orchestration in `src/handler.js`: OPTIONS -> auth -> guard -> DB -> router -> service.
- Added exact-route dispatcher in `src/router.js` with explicit frozen delete route returning 405.
- Split config, middleware, services, schemas, models, and utilities into dedicated modules.

## Functional Improvements

- Standardized all responses through `createSuccessResponse`/`createErrorResponse` with consistent shape.
- Added strict JWT middleware for all non-OPTIONS routes.
- Added request guard for malformed JSON and route-level path validation for `_id`.
- Added schema-driven validation for PUT update payloads.

## Validation And Error Handling Improvements

- Malformed JSON now returns 400 with `others.invalidJSON` instead of generic 500.
- Missing required path params now return 400 with domain error keys.
- Duplicate order id updates now return 409 with `orderVerification.errors.duplicateOrderId`.
- Service-level catch blocks now log structured errors and return `others.internalError`.

## Security Improvements

- Introduced JWT verification with explicit HS256 algorithm.
- Removed fuzzy route matching and replaced with exact route keys based on `event.resource`.
- Added output sanitization layer before entity payload responses.
- Added explicit 405 freezing for deprecated/unsupported DELETE route.

## Performance And Maintainability Improvements

- Added singleton DB connection with `maxPoolSize: 1` and connection promise caching.
- Added lazy route loading to reduce cold-start work per invocation.
- Centralized logging with structured JSON entries for CloudWatch triage.
- Centralized locale-backed error translation resolution.

## Constraints And Deferred Work

- `infra-owned`: enforce MongoDB unique index for `orderVerification.orderId` to remove race window fully.
- `code-owned`: evaluate fine-grained route-level RBAC once role matrix is defined for supplier/operator paths.
- `code-owned`: evaluate whether WhatsApp link endpoint should remain protected or become a constrained public route.

## Result Of This Stage

- Lambda now follows the UserRoutes-style lifecycle and modular separation baseline.
- Security and error handling posture is materially stronger while preserving API path contracts.
- Remaining risk is documented explicitly as deferred work items.
