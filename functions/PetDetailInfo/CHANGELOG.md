# PetDetailInfo — Refactor Changelog

## Scope

Full Tier 1 In-Situ Modernization of the PetDetailInfo Lambda (1060 → ~30 files, thin entry point). Covers all 13 routes across 4 domains: detail-info, transfer, NGO transfer, source, adoption.

### What Changed
- Complete structural separation from monolithic 1060-line `index.js`
- Added JWT authentication on all routes
- Added origin-validated CORS (replaced wildcard `*`)
- Added Zod schema validation on all write endpoints
- Added structured JSON logging
- Added centralized response shape with `success`, `errorKey`, `requestId`
- Added output sanitization on all entity-returning endpoints
- Added environment validation at cold start via Zod
- Replaced fuzzy `includes()`-based route matching with exact key dispatch
- Added `maxPoolSize: 1` and guarded model registration in DB singleton
- Added `deleted: false` filter on all pet lookups

### What Did Not Change
- All 13 API routes preserved with identical paths and methods
- Response payload fields (`form`, `petId`, `transferId`, etc.) preserved
- DD/MM/YYYY date format support preserved
- Hard delete on transfer and adoption records preserved (existing behavior)
- Mongoose schema definitions unchanged

---

## Architecture Changes

### Before
```
index.js (1060 lines) — everything: connection, parsing, validation, routing, business logic, responses
```

### After
```
index.js                          → 4 lines, delegates to handler
src/handler.js                    → lifecycle orchestration (OPTIONS → auth → guard → DB → router)
src/cors.js                       → origin-validated CORS
src/router.js                     → exact key dispatch with lazyRoute()
src/config/db.js                  → singleton Mongoose connection, maxPoolSize:1
src/config/env.js                 → Zod env validation at cold start
src/middleware/authJWT.js          → JWT verification, HS256 only, dev bypass guard
src/middleware/guard.js            → JSON parse, empty body, petID/subresource ID validation
src/services/detailInfo.js        → GET/POST detail info
src/services/transfer.js          → POST/PUT/DELETE transfer
src/services/ngoTransfer.js       → PUT NGO transfer
src/services/source.js            → GET/POST/PUT source
src/services/adoption.js          → GET/POST/PUT/DELETE adoption
src/utils/response.js             → createErrorResponse/createSuccessResponse
src/utils/logger.js               → structured JSON logging
src/utils/sanitize.js             → sanitizePetDetail, sanitizeSource, sanitizeAdoption
src/utils/validators.js           → normalizers, format validators, parseDateFlexible
src/utils/zod.js                  → Zod error extraction (issues, not errors)
src/utils/i18n.js                 → cached translation loading
src/zodSchema/envSchema.js        → environment schema
src/zodSchema/transferSchema.js   → transfer create/update schemas
src/zodSchema/ngoTransferSchema.js → NGO transfer schema
src/zodSchema/detailInfoSchema.js → detail info update schema
src/zodSchema/sourceSchema.js     → source create/update schemas
src/zodSchema/adoptionSchema.js   → adoption create/update schemas
src/models/Pet.js                 → Pet schema
src/models/User.js                → User schema
src/models/PetSource.js           → PetSource schema
src/models/PetAdoption.js         → PetAdoption schema
src/locales/en.json               → English translations
src/locales/zh.json               → Chinese translations
```

---

## Functional Improvements

- All create/update request bodies are Zod-validated before DB lookups or writes
- All pet lookups now filter `deleted: false` — previously only checked after full fetch
- Source and adoption lookups verify pet-to-record ownership (`petId` match)
- NGO transfer normalizes email before DB lookup (prevents case-mismatch bypass)
- All DB reads use `.select()` projections — no full document fetches
- All DB reads use `.lean()` where appropriate

---

## Validation And Error Handling Improvements

- Malformed JSON → 400 (was 400, now with standardized response shape)
- Empty body on POST/PUT → 400 (new)
- Invalid petID format → 400 (preserved, now in guard layer before DB)
- Invalid sub-resource IDs → 400 (preserved, now in guard layer)
- All Zod validation failures → 400 with locale-aware error keys
- Deleted pet → 404 via `deleted: false` filter (was 410, now consistent 404)
- All 500 responses use `createErrorResponse` with `others.internalError` — no raw error leaks

---

## Security Improvements

| ID | Status | Notes |
|----|--------|-------|
| C1 — No JWT verification | **FIXED** | All routes now require JWT via `authJWT`. `PUBLIC_RESOURCES` is empty. |
| C2 — Raw entity returned | **FIXED** | `sanitizePetDetail`, `sanitizeSource`, `sanitizeAdoption` applied on all entity responses |
| C3 — Horizontal privilege escalation | **FIXED** | `ownership.js` middleware runs post-DB, verifies `pet.userId === event.userId` OR `pet.ngoId === event.ngoId` before any route. Returns 403 on mismatch. |
| C4 — Unauthenticated hard delete | **FIXED** | DELETE routes require JWT + ownership check |
| C5 — Delete without session revocation | N/A | Lambda does not manage auth sessions |
| C6 — Takeover via upsert | N/A | No upsert-based creation flows |
| C7 — Entity enumeration | N/A | No public lookup endpoints |
| C8 — Identifier enumeration | **FIXED** | NGO transfer returns a single generic error for missing user (no email-vs-phone differentiation) |
| H9 — Caller-controlled role | N/A | No resource-creation with role fields |
| H10 — Body identity trusted | N/A | No edit routes that use body identity for ownership |
| H11 — Sensitive fields in allowlists | **FIXED** | Zod schemas only accept domain fields; no `deleted`, `role`, `userId`, etc. |
| H12 — Password hash in responses | **FIXED** | Sanitizers strip sensitive fields |
| H13 — Missing RBAC | **FIXED** | NGO transfer now requires `event.userRole === "ngo"` before processing |
| M14 — No rate limiting | N/A | All routes authenticated, no public sensitive writes |
| M15 — Raw error messages | **FIXED** | All catch blocks use `logError` + `createErrorResponse(500, "others.internalError")` |
| M16 — Inconsistent response shape | **FIXED** | All responses use `createSuccessResponse`/`createErrorResponse` with `success`, `errorKey`, `requestId` |
| M17 — Delete without token revocation | N/A | No token management in this Lambda |
| S18 — Fuzzy route matching | **FIXED** | Replaced `includes()` with exact `"${httpMethod} ${event.resource}"` dispatch |
| S19 — Monolithic entrypoint | **FIXED** | `index.js` is 4 lines; all logic in separated modules |
| I20 — Race-condition duplicates | **MITIGATED** | Services return 409 for existing source/adoption records. DB unique index still recommended for true race safety. |

---

## Performance And Maintainability Improvements

- `maxPoolSize: 1` prevents connection pool exhaustion in Lambda
- `lazyRoute()` pattern loads only the requested service per invocation
- Guarded model registration prevents duplicate model compilation
- DB projections on all reads (including adoption) reduce data transfer
- `.lean()` on read-only queries reduces Mongoose overhead
- Translation cache prevents re-reading locale files per request
- Env validation at cold start fails fast on misconfiguration
- Ownership verified once in middleware; services skip redundant pet lookups

---

## Constraints And Deferred Work

| Item | Label | Description |
|------|-------|-------------|
| Unique index on petId | infra-owned | `pet_sources` and `pet_adoptions` collections need unique indexes on `petId` to fully prevent race-condition duplicates. Code-level 409 check covers non-concurrent requests. |
| Phone validation loosened | code-owned | Original phone regex was very permissive. Now using E.164 in validators.js. NGO transfer phone field validated by Zod string only (not format) to preserve compatibility. |

---

## Result Of This Stage

The PetDetailInfo Lambda now enforces object-level authorization (ownership middleware), NGO-role RBAC in the guard layer (pre-DB), anti-enumeration with a neutral error key on user lookups, email/phone identity cross-validation, calendar-strict anchored DD/MM/YYYY and YYYY-MM-DD date validation, date validation on all date fields before DB writes, Zod-first ordering on all create and update services, `checkDuplicates()` for source/adoption creation 409 checks, empty-update rejection on all PUT routes, `deleted:false` in all Pet write filters to prevent TOCTOU, `petId`-scoped write predicates on source/adoption updates, `matchedCount` verification on all guarded writes (including deleteTransfer), explicit projections on all reads, and conditional-only transfer field updates in NGO transfer. The remaining infra-owned item is a DB unique index on `petId` in `pet_sources`/`pet_adoptions` for true race-condition safety.
