# GetBreed - CHANGELOG

## Refactor - In-Situ Modernization (Tier 2 Partial Separation)

### Scope

Refactored the legacy monolithic `index.js` into a Tier 2 separated structure aligned to the `REFACTOR_CHECKLIST.md` lifecycle. `GetBreed` remains a legacy/support Lambda for reference-data retrieval while the broader DDD API redesign is planned separately.

Preserved behavior:
- legacy collection names
- legacy response payload shapes for successful reads
- legacy public-read route intent
- legacy product-log write behavior
- active route set limited to the deployed legacy resources:
  `GET /animal/animalList/{lang}`
  `GET /product/productList`
  `POST /product/productLog`
  `GET /deworm`
  `GET /analysis/{eyeDiseaseName}`
  plus `OPTIONS` on each resource

### Architecture Changes

Before:
- single entrypoint mixed routing, validation, DB access, and response handling inline
- route dispatch relied on broad path substring checks
- ad-hoc error and CORS handling

After:
```text
index.js                          -> thin entry
src/handler.js                    -> lifecycle orchestration (CORS -> Guard -> DB -> Route)
src/router.js                     -> exact-key route dispatch with lazyRoute()
src/config/env.js                 -> cold-start env validation
src/config/db.js                  -> singleton Mongo connection and model registration
src/cors.js                       -> CORS allowlist handling
src/middleware/guard.js           -> JSON parse, empty-body, parameter validation
src/services/referenceData.js     -> reference-data and product-log workflows
src/utils/*.js                    -> response, logging, i18n
src/locales/*.json                -> stable localized error messages
```

### Functional Improvements

- Request flow now follows a consistent handler lifecycle instead of inline branching.
- Route dispatch is now exact-match based on `"${event.httpMethod} ${event.resource}"`.
- MongoDB connection reuse now follows the singleton + `connPromise` pattern with `maxPoolSize: 1`.
- Product-log writes are separated from read-only reference-data flows.
- Error responses are standardized through shared helpers and include `requestId` when available.

### Validation And Error Handling Improvements

- Malformed JSON on `POST /product/productLog` now returns `400 common.invalidJSON`.
- Empty or missing required product-log fields now return `400 common.missingParams`.
- Missing route params for language or eye disease lookup now return stable domain error keys instead of ad-hoc strings.
- Outer handler failures are logged structurally and return `500 common.internalError`.

### Result Of This Stage

`GetBreed` now matches the repo’s handler-based modernization baseline for a Tier 2 Lambda. It should be treated as a stabilized legacy/support surface that can remain available during the future DDD API rebuild, without forcing the new domain design to inherit its route shapes.
