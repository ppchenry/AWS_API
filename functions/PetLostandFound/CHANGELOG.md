# PetLostandFound — CHANGELOG

## v2.0.0 — In-Situ Modernization (Tier 1 Full Separation)

### Scope

Full refactor of the PetLostandFound Lambda from a 1100+ line monolithic `index.js` to the UserRoutes-standard modular architecture. All active routes preserved. Dead code removed. Auth, CORS, validation, logging, and response shape standardized.

**Not changed**: Business logic for serial number generation, S3 upload flow, multipart form parsing.

### Schema Changes

- **PetLost model**: `birthday` changed from `required: true` to optional (aligns with Zod schema).
- **PetFound model**: Added `userId` field (ObjectId) for ownership tracking. Added `breed` field (String) to match validated input.
- **Notification schema**: Removed `isArchived` from create input (H11 — lifecycle flag must not be client-controlled). Added ObjectId format validation on `petId`.
- **Zod upgraded**: v3 → v4 to match UserRoutes baseline. `{ error: "..." }` syntax now produces locale dot-keys correctly.

### Architecture Changes

**Before**: Single `index.js` (ESM) containing all imports, DB connection, helper functions, route matching via `includes()`, inline response building, and 3 dead code blocks.

**After**: Tier 1 layout with 20+ focused modules:

| File | Responsibility |
|------|---------------|
| `index.js` | 5-line entry point, delegates to handler |
| `src/handler.js` | Lifecycle orchestration: OPTIONS → Auth → Guard → DB → Router |
| `src/cors.js` | Origin-validated CORS headers |
| `src/router.js` | Exact `"${method} ${resource}"` route dispatch with `lazyRoute()` |
| `src/config/env.js` | Zod env validation at cold start |
| `src/config/db.js` | Singleton Mongoose connection, maxPoolSize:1, guarded model registration |
| `src/config/s3.js` | S3Client singleton |
| `src/middleware/authJWT.js` | JWT verification with HS256, dev bypass guard |
| `src/middleware/guard.js` | JSON parse, empty-body check, self-access, path param validation |
| `src/services/petLost.js` | Pet lost CRUD (list, create, delete) |
| `src/services/petFound.js` | Pet found CRUD (list, create, delete) |
| `src/services/notifications.js` | Notification CRUD (list, create, archive) |
| `src/services/imageUpload.js` | S3 image upload + serial number generation |
| `src/utils/response.js` | `createErrorResponse` / `createSuccessResponse` |
| `src/utils/logger.js` | Structured JSON logging |
| `src/utils/sanitize.js` | Entity sanitizers |
| `src/utils/validators.js` | `parseDDMMYYYY`, `isValidObjectId`, format validators |
| `src/utils/zod.js` | Zod error extraction (v4 `.issues` API) |
| `src/utils/i18n.js` | Translation loading + dot-key resolution |
| `src/zodSchema/*.js` | Zod schemas for env, petLost, petFound, notification |
| `src/locales/{en,zh}.json` | i18n translations |

Request lifecycle order: `callbackWaitsForEmptyEventLoop=false` → CORS preflight → JWT auth → guard (JSON parse, empty body, self-access, path params) → DB connect → route dispatch → service execution.

### Functional Improvements

- Module system converted from ESM to CJS to match UserRoutes baseline.
- `Access-Control-Allow-Origin: *` replaced with origin-validated CORS (`ALLOWED_ORIGINS` env var).
- Response shape standardized: all responses include `success`, `errorKey`, `requestId`.
- Multipart form POST routes (pet-lost, pet-found) skip JSON body parsing in guard; multipart parsing handled in service via `lambda-multipart-parser`.
- Serial number generation refactored to use `Promise.all` for parallel PetLost/PetFound max lookup with null-safe handling.

### Validation And Error Handling Improvements

- Zod schemas validate all POST inputs before DB writes (pet-lost, pet-found, notifications).
- Path parameters (`userId`, `petLostID`, `petFoundID`, `notificationId`) validated as ObjectId format before reaching services.
- Empty body on POST/PUT returns 400 (not 500).
- Malformed JSON returns 400 with `others.invalidJSON` key.
- All catch blocks use `logError` + `createErrorResponse(500, "others.internalError")` — no raw `error.message` leak.

### Security Improvements

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| C1 | No JWT verification | **FIXED** | All routes require JWT. `PUBLIC_RESOURCES = []`. |
| C2 | Raw entity returned | **FIXED** | `sanitizePetLost`, `sanitizePetFound`, `sanitizeNotification` strip `__v`. |
| C3 | Horizontal privilege (body identity) | **FIXED** | `createPetLost` uses `event.userId` from JWT, not `form.userId`. |
| C4 | Unauthenticated hard delete | **FIXED** | DELETE routes require JWT and verify the caller owns the record (userId match). |
| C5 | Delete without session revocation | N/A | Lambda does not manage auth sessions. |
| C6 | Takeover via upsert | N/A | No upsert-based creation. |
| C7 | Entity enumeration | N/A | No public lookup endpoints (all routes protected). |
| C8 | Identifier enumeration | N/A | No verification/code-dispatch flows. |
| H9 | Caller-controlled role | N/A | No resource-creation with access-level fields. |
| H10 | Body identity trusted | **FIXED** | Pet-lost POST uses `event.userId` from JWT. |
| H11 | Sensitive lifecycle fields | **FIXED** | `isArchived` stripped from notification create schema. Zod schemas only accept declared fields. |
| H12 | Password hash in response | N/A | No password fields in PetLost/PetFound/Notification schemas. |
| H13 | Missing RBAC | N/A | No role-restricted routes. |
| M14 | No rate limiting | **FIXED** | `enforceRateLimit()` gate on pet-lost and pet-found create (5 req/60s per user). |
| M15 | Raw error message leak | **FIXED** | All catch blocks return generic error with `logError`. |
| M16 | Inconsistent status/shape | **FIXED** | All responses via `createErrorResponse`/`createSuccessResponse`. |
| M17 | Delete without token revocation | N/A | No token management. |
| S18 | Fuzzy route matching | **FIXED** | Replaced `includes()` with exact `"${method} ${resource}"` dispatch. |
| S19 | Monolithic entrypoint | **FIXED** | 5-line `index.js` delegating to `handler.js`. |
| I20 | Race-condition duplicates | DEFERRED (infra-owned) | Serial number generation is not atomic. Requires DB unique index. |

### Performance And Maintainability Improvements

- `lazyRoute()` pattern: only the requested service module is loaded per invocation.
- `maxPoolSize: 1` enforced on Mongoose connection.
- Env validation at cold start (fail-fast on misconfiguration).
- DB connection reuse with double-check pattern (`conn && readyState` + `connPromise`).
- Model registration guarded with `mongoose.models.X ||`.
- `.lean()` on all read-only queries.
- `.select("-__v")` projections on all list queries.
- Translation cache at module level (no per-request file reads).

### Dead Code Removed

| Block | Lines (original) | Reason |
|-------|-------------------|--------|
| `/pets/upload-array-images` | ~163–300 | API Gateway routes to EyeUpload |
| `/pets/gets3Image` | ~301–440 | API Gateway routes to EyeUpload |
| Catch-all tag uploader | ~930–1027 | API route deleted, dangerous fallback |

Dependencies removed: `aws-sdk` (v2), `axios` — both only used by dead code.

### Behavior Changes

- **Breaking**: All routes now require JWT authentication (previously no auth). Clients must include `Authorization: Bearer <token>` header.
- **Breaking**: `Access-Control-Allow-Origin: *` replaced with origin-validated CORS. Clients from unlisted origins will receive no CORS headers.
- **Breaking**: Module system changed from ESM to CJS.
- Pet-lost POST now uses `event.userId` from JWT instead of `form.userId` from request body.
- Error responses now include `errorKey` and `requestId` fields.
- Successful responses now include `success: true`.

### Constraints And Deferred Work

| Item | Label | Description |
|------|-------|-------------|
| Serial number race condition | infra-owned | `getNextSerialNumber()` is not atomic. A DB unique index on `serial_number` across both collections would eliminate the window. |
| Hard delete vs soft delete | code-owned | Both pet-lost and pet-found DELETE perform hard deletes. Should migrate to `{ deleted: true }` pattern. |

### Result Of This Stage

The Lambda is now modular, auditable, and follows the UserRoutes standard across all dimensions: lifecycle ordering, security, validation, logging, response shape, CORS, and DB connection management. The 1100-line monolith has been decomposed into 20+ focused modules. All 3 dead code blocks have been removed. 18 of 20 security checklist items are addressed (FIXED or N/A), with 2 deferred items (1 code-owned, 1 infra-owned). The remaining gaps are the serial number race condition (infra-owned) and hard-delete vs soft-delete migration (code-owned).

---

## v2.0.1 — Integration Testing & Bug Fixes

### Bug Fixes

| # | Issue | Fix |
|---|-------|-----|
| 1 | `mime` v4 is ESM-only — `require("mime")` crashes in CJS Lambda runtime | Replaced static `require("mime")` with lazy `async getMime()` using dynamic `import()`. MIME result cached in module-level `_mime` variable. |
| 2 | Rate limit tests used non-hex userId strings (e.g. `rl_lost_...`) causing CastError on Mongoose ObjectId fields | Test-only fix — rate limit userIds now generated as valid 24-char hex strings. |

### Integration Test Suite

**File:** `__tests__/test-petlostandfound.test.js`
**Result:** 59 / 59 tests passed ✅
**Runtime:** ~72 seconds against SAM local + UAT MongoDB

#### Test Coverage Summary

| Category | Tests | Status |
|----------|-------|--------|
| CORS Preflight | 4 | ✅ |
| Authentication | 5 | ✅ |
| Route Dispatch (405) | 2 | ✅ |
| Guard — Path Param Validation | 4 | ✅ |
| Guard — Self-Access | 2 | ✅ |
| Guard — Body Validation | 3 | ✅ |
| GET /pets/pet-lost | 4 | ✅ |
| POST /pets/pet-lost | 4 | ✅ |
| DELETE /pets/pet-lost/{petLostID} | 4 | ✅ |
| GET /pets/pet-found | 2 | ✅ |
| POST /pets/pet-found | 2 | ✅ |
| DELETE /pets/pet-found/{petFoundID} | 3 | ✅ |
| GET notifications | 3 | ✅ |
| POST notifications | 5 | ✅ |
| PUT notifications (archive) | 4 | ✅ |
| Rate Limiting | 2 | ✅ |
| Response Shape | 2 | ✅ |
| DB Cleanup | 4 | ✅ |
| **Total** | **59** | **✅** |

#### Key Findings During Testing

1. **`mime` v4 ESM incompatibility** — The `mime` package v4.x is ESM-only. When deployed to SAM local Docker (nodejs22.x), `require("mime")` threw `ERR_REQUIRE_ESM`. This did not surface during local `node -e "require('./index.js')"` because Node 22 on Windows handles the import differently than the Lambda Docker runtime. Fixed with dynamic `import()`.
2. **Guard ordering** — Self-access check runs before ObjectId format validation in the guard middleware. When `userId` in the path doesn't match the JWT userId, the response is 403 (selfAccessDenied) regardless of whether the userId is a valid ObjectId. This is correct security behavior (deny early).
3. **SAM local DNS** — `mongodb+srv://` SRV resolution works inside SAM Docker containers on this network. No workaround needed.
