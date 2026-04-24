# GetBreed - SECURITY

## Modernization Notes

`GetBreed` was not one of the original security-audit-heavy reference Lambdas, but it still carried several legacy structural risks that are now reduced by the modularization pass.

### Key Improvements

**1. Route confusion risk reduced**

- Before: route selection depended on broad `event.resource?.includes(...)` / `event.path?.includes(...)` checks inside one large handler.
- After: [`src/router.js`](./src/router.js) uses exact `"${event.httpMethod} ${event.resource}"` keys and returns `405 common.methodNotAllowed` for unknown routes.

**2. Response handling standardized**

- Before: each branch manually built its own response object and raw error text could leak back to callers.
- After: all success/error responses flow through [`src/utils/response.js`](./src/utils/response.js), with localized error keys and optional `requestId`.

**3. DB connection behavior hardened**

- Before: the Lambda kept a simple singleton connection without in-flight connection coordination or Lambda pool limits.
- After: [`src/config/db.js`](./src/config/db.js) uses the repo-standard singleton + `connPromise` pattern and enforces `maxPoolSize: 1`.

**4. Guard layer introduced**

- Before: parameter checks and JSON parsing were embedded inconsistently inside business branches.
- After: [`src/middleware/guard.js`](./src/middleware/guard.js) performs cheap request validation before service execution.

**5. Environment validation added**

- Before: missing critical env values would fail later and less predictably at runtime.
- After: [`src/config/env.js`](./src/config/env.js) validates required env vars at cold start and fails fast with structured logs.

## Remaining Characteristics

- This Lambda is still a legacy/support surface for reference data.
- It now exposes the narrowed deployed legacy route family only for `GET /animal/animalList/{lang}`, `GET /product/productList`, `POST /product/productLog`, `GET /deworm`, and `GET /analysis/{eyeDiseaseName}`, each with `OPTIONS`.
- It is not the target contract for the planned DDD API set; it is the stabilized compatibility layer while the new API surface is designed.
