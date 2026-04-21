# CHANGELOG

## Scope

This refactor modernizes `SFExpressRoutes` from a monolithic `index.js` into a full Tier 1 modular structure aligned with the refactor checklist baseline. The API paths and core business outcomes are preserved.

## Architecture Changes

- Replaced monolithic entrypoint with a thin delegating `index.js`.
- Added lifecycle orchestrator in `src/handler.js` with strict stage ordering: OPTIONS -> auth -> guard -> DB -> router -> service.
- Added exact-match route dispatch in `src/router.js`.
- Added dedicated modules for CORS, JWT middleware, request guard, DB connection, environment validation, responses, logging, i18n, zod helpers, and rate limiting.
- Added service module `src/services/sfExpress.js` for all SF workflows.
- Added models under `src/models` and schemas under `src/zodSchema`.

## Functional Improvements

- Unified response shape via `createSuccessResponse` and `createErrorResponse`.
- Added request-level input validation via Zod for all route bodies.
- Added route-level 405 handling for unsupported routes.
- Added centralized, reusable SF service helpers for OAuth, std service calls, and PDF download.

## Validation And Error Handling Improvements

- Malformed JSON now returns 400 (`others.invalidJSON`) instead of generic 500.
- Missing required body now returns 400 (`others.missingParams`).
- Route body schema failures now return 400 with locale error keys.
- Unknown route/method now returns 405 (`others.methodNotAllowed`).
- Unexpected failures now log structured details and return `others.internalError`.

## Security Improvements

- Added JWT verification middleware with HS256 enforcement.
- Added explicit JWT bypass guard constrained to non-production only.
- Added structured guard stage before DB access.
- Added per-action rate limiting on sensitive write/external-service flows.
- Removed hardcoded SF address API key from source and moved to environment variable.

## Performance And Maintainability Improvements

- Added lazy route loading to reduce cold-start overhead.
- Added singleton DB connection with `maxPoolSize: 1` and concurrent cold-start protection.
- Added focused DB queries using projection and lean reads where applicable.
- Reduced coupling by isolating external API integrations into service helpers.

## Constraints And Deferred Work

- Infra-owned: duplicate-creation race conditions can still exist unless enforced by DB-level unique indexes on relevant fields.
- Code-owned: evaluate whether all SF routes should remain protected or if selected routes should be explicitly public by policy decision.

## Result Of This Stage

`SFExpressRoutes` now follows the standardized modular lifecycle and security baseline, with significantly improved traceability, validation correctness, and operational safety while preserving the existing route surface.
