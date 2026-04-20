# PetMedicalRecord — CHANGELOG

## Refactor — In-Situ Modernization (Tier 1 Full Separation)

### Scope

Refactored the monolithic 900-line `index.js` into a fully separated Tier 1 structure following the UserRoutes baseline. All 16 CRUD endpoints across 4 record types (medical, medication, deworm, blood test) are preserved with identical API contracts.

**Not changed:** Mongoose schema definitions, locale translation keys, business logic for record counting/deworm date tracking, response payload shapes.

### Architecture Changes

**Before:** Single `index.js` containing DB connection, translations, validation, routing (via `includes()`), and all business logic inline.

**After:**
```
index.js                          → 4-line thin entry
src/handler.js                    → lifecycle orchestration (CORS → Auth → Guard → DB → Route)
src/cors.js                       → origin-based CORS (no wildcard)
src/router.js                     → exact key matching with lazyRoute()
src/config/env.js                 → Zod env validation at cold start
src/config/db.js                  → singleton connection, maxPoolSize:1, guarded model registration
src/middleware/authJWT.js          → JWT verification with HS256, dev bypass guard
src/middleware/guard.js            → JSON parse, empty body, ObjectId validation
src/services/medical.js            → medical record CRUD
src/services/medication.js         → medication record CRUD
src/services/deworm.js             → deworm record CRUD
src/services/bloodTest.js          → blood test record CRUD
src/utils/response.js              → createErrorResponse/createSuccessResponse with CORS
src/utils/logger.js                → structured JSON logging
src/utils/i18n.js                  → cached translation loading
src/utils/sanitize.js              → output field stripping
src/utils/validators.js            → ObjectId, date format, parseDDMMYYYY
src/utils/zod.js                   → Zod v4 issue extraction (error.issues)
src/zodSchema/envSchema.js         → env var validation schema
src/zodSchema/medicalSchema.js     → medical record Zod schemas
src/zodSchema/medicationSchema.js  → medication record Zod schemas
src/zodSchema/dewormSchema.js      → deworm record Zod schemas
src/zodSchema/bloodTestSchema.js   → blood test record Zod schemas
```

### Functional Improvements

- Guard layer runs before DB connection — malformed requests fail without touching MongoDB.
- Lazy route loading — only the requested service module is loaded per invocation.
- Translation cache — locale files read once per container, not per request.
- DB connection uses double-check pattern (`readyState` + `connPromise`) to prevent duplicate connections.

### Validation and Error Handling Improvements

- All path ObjectId params validated at guard layer (returns 400, not 500).
- Empty body on POST/PUT returns 400 with `others.missingParams`.
- Zod schema validation on all POST/PUT payloads before business logic.
- Every service function has try/catch returning `createErrorResponse(500, "others.internalError", event)`.
- Structured error responses include `errorKey`, `error` (translated), and `requestId`.

### Security Improvements

- **C1 — JWT verification**: All routes now pass through `authJWT`. `PUBLIC_RESOURCES` is an empty array (all routes protected).
- **C2 — Raw entity returned**: Records sanitized via `sanitizeRecord()` stripping `__v`, `createdAt`, `updatedAt`.
- **C4 — Unauthenticated delete**: All DELETE routes require JWT.
- **S18 — Fuzzy route matching**: Replaced `includes()`/`event.path` matching with exact `"${httpMethod} ${event.resource}"` key lookup.
- **S19 — Monolithic entrypoint**: Entry file is 4 lines. All logic in `src/`.
- **M15 — Raw error messages**: Catch blocks use `logError` + `createErrorResponse(500, ...)`. No `error.message` leaks.
- **M16 — Inconsistent response shape**: All responses use `createErrorResponse`/`createSuccessResponse` with consistent shape.
- CORS hardened: no more wildcard `Access-Control-Allow-Origin: *`.
- JWT enforces `algorithms: ["HS256"]` to block `alg:none` attacks.

### Performance and Maintainability Improvements

- `maxPoolSize: 1` in Mongoose config (mandatory for Lambda).
- `.select()` projections on all GET queries.
- `.lean()` on read-only queries.
- `lazyRoute()` pattern minimizes cold-start overhead.
- `Promise.all()` for independent DB operations in deworm delete.
- Each module has a single responsibility.

### Constraints and Deferred Work

| Item | Status | Label |
|------|--------|-------|
| C3 — Horizontal privilege escalation | DEFERRED | infra-owned — Pet ownership check requires loading Pet doc and comparing userId. API Gateway authorizer expected to handle coarse access control. |
| C5 — Delete without session revocation | NOT APPLICABLE | Lambda does not manage auth sessions. |
| C6 — Takeover via upsert | NOT APPLICABLE | No upsert-based creation flows. |
| C7 — Entity enumeration | NOT APPLICABLE | No public lookup endpoints. |
| C8 — Identifier enumeration | NOT APPLICABLE | No verification endpoints. |
| H9 — Caller-controlled role | NOT APPLICABLE | No role fields in record creation. |
| H10 — Body identity trusted for ownership | FIXED | petId comes from path param, not body. |
| H11 — Sensitive lifecycle fields in edit | FIXED | Zod schemas only accept domain fields. |
| H12 — Password hash in responses | NOT APPLICABLE | No user entities returned. |
| H13 — Missing RBAC | NOT APPLICABLE | No role-restricted routes. |
| M14 — No rate limiting | NOT APPLICABLE | No public routes or sensitive write flows. |
| M17 — Delete without token revocation | NOT APPLICABLE | No auth session management. |
| I20 — Race-condition duplicate creation | NOT APPLICABLE | No uniqueness constraints on records. |

### Result of This Stage

PetMedicalRecord is now structurally aligned with the UserRoutes baseline. All 16 endpoints preserved. JWT authentication added to all routes. CORS hardened. Route matching is exact-key. Structured logging and consistent response shapes throughout. Cold-start optimized with lazy routing and `maxPoolSize: 1`.
