# GetAllPets — CHANGELOG

## Refactor v2.0.0 — In-Situ Modernization

### Scope

Full Tier 2 (Partial Separation) refactor of the GetAllPets Lambda. Restructured from a 416-line monolithic `index.js` into modular `src/` architecture matching the UserRoutes baseline.

**Changed**: index.js, authJWT.js, cors.js, all business logic, response handling, validation, DB connection, logging  
**Not changed**: Pet model schema, locale translation keys (existing keys preserved), functional behavior of all 4 routes

---

### Architecture Changes

- **Entry point**: `index.js` reduced from 416 lines to 5 lines (thin handler delegation)
- **Request lifecycle**: Canonical 5-stage lifecycle (CORS → Auth → Guard → DB → Route Dispatch)
- **Route dispatch**: Replaced `includes()`/`path` fuzzy matching with exact `"${httpMethod} ${event.resource}"` key matching via `router.js`
- **Lazy loading**: Services loaded on-demand via `lazyRoute()` pattern to minimize cold-start overhead
- **Module separation**: Handler, router, guard, CORS, auth, DB, services, utils all in dedicated single-purpose files

### New File Structure

```
functions/GetAllPets/
  index.js                          ← 5 lines, thin delegation
  src/
    handler.js                      ← Lifecycle orchestration
    router.js                       ← Exact route key dispatch + lazyRoute
    cors.js                         ← CORS headers + OPTIONS handling
    config/
      env.js                        ← Zod env validation at cold start
      db.js                         ← Singleton MongoDB connection, maxPoolSize: 1
    middleware/
      authJWT.js                    ← JWT verification, HS256 enforced, no prod bypass
      guard.js                      ← JSON parse, empty body, self-access, ObjectId validation
      selfAccess.js                 ← Path-based self-access + DB-backed pet ownership
    services/
      ngoPetList.js                 ← GET /pets/pet-list-ngo/{ngoId}
      deletePet.js                  ← POST /pets/deletePet (owner only)
      updatePetEye.js               ← PUT /pets/updatePetEye (owner only)
      userPetList.js                ← GET /pets/pet-list/{userId} (self-access only)
    models/
      pet.js                        ← Mongoose schema (unchanged)
    locales/
      en.json, zh.json              ← Translation files with added `others.*` keys
    utils/
      response.js                   ← createErrorResponse / createSuccessResponse
      logger.js                     ← Structured JSON logging
      i18n.js                       ← Translation loader with caching
      validators.js                 ← ObjectId, date, URL, regex escape validators
      sanitize.js                   ← Pet entity sanitization
      zod.js                        ← Zod v4 error extraction helpers
    zodSchema/
      envSchema.js                  ← Environment variable validation
      petSchema.js                  ← Input schemas for deletePet, updatePetEye
```

---

### Functional Improvements

- NGO pet list now uses `Promise.all()` for parallel find + countDocuments
- User pet list now uses `Promise.all()` for parallel find + countDocuments
- `updatePetEye` now uses `findOneAndUpdate` with `$push` instead of fetch + push + save (single round-trip)
- `deletePet` uses focused `.select("deleted")` projection instead of full document fetch

---

### Validation And Error Handling Improvements

- JSON parse errors caught in guard before DB connection, returning 400 instead of 500
- Empty POST/PUT bodies now return 400 instead of proceeding with null data
- Path parameter ObjectId format validated pre-DB in guard
- All service inputs validated with Zod schemas (deletePet, updatePetEye)
- All error responses now include `errorKey`, `success: false`, and `requestId`

---

### Security Improvements

- **C1 — No JWT verification**: Fixed. `deletePet` and `updatePetEye` were completely unauthenticated. Now all mutation routes require JWT. Only NGO pet list is public (read-only listing).
- **C2 — Raw entity returned**: Fixed. All pet responses pass through `sanitizePet()`/`sanitizePets()`.
- **C3 — Horizontal privilege escalation**: Fixed. Two-tier ownership enforcement:
  - `GET /pets/pet-list/{userId}`: Path userId must match JWT userId — enforced in `guard.js` via `selfAccess.js` `pathUserId` policy (cheap, pre-DB).
  - `POST /pets/deletePet`: Atomic ownership-guarded write — `updateOne` filter includes `{ userId: event.userId, deleted: { $ne: true } }`. On no match, a diagnostic read distinguishes 404/409/403.
  - `PUT /pets/updatePetEye`: Atomic ownership-guarded write — `findOneAndUpdate` filter includes `{ userId: event.userId, deleted: { $ne: true } }`. Same diagnostic fallback.
- **C4 — Unauthenticated hard delete**: Fixed. Soft-delete was already in place, now JWT-protected with ownership enforcement.
- **H10 — Body identity trusted for ownership**: Fixed. Mutation routes extract caller identity from JWT (`event.userId`), compare against `pet.userId` from DB, never from request body.
- **H12 — Password hash in responses**: Not applicable (Pet model has no password field).
- **M14 — Rate limiting**: Not applicable — no public write flows. NGO list is read-only.
- **M15 — Raw error messages**: Fixed. Catch blocks now use `logError()` + `createErrorResponse(500, "others.internalError")`.
- **M16 — Inconsistent status codes**: Fixed. All responses use centralized builders.
- **S18 — Fuzzy route matching**: Fixed. Replaced `includes()`/`startsWith()` with exact key matching.
- **S19 — Monolithic entrypoint**: Fixed. Full module separation.

### Security Items Not Applicable to This Lambda

- C5 (session revocation on delete) — no auth sessions managed
- C6 (upsert-based creation) — no upsert creation flows
- C7 (entity enumeration) — no public lookup endpoints
- C8 (identifier enumeration) — no verification flows
- H9 (caller-controlled role) — no creation flows with role fields
- H10 (body identity in edits) — Fixed, see C3 above
- H11 (sensitive lifecycle fields) — Zod schemas use `.strict()`, only allow expected fields
- H13 (missing RBAC) — no role-restricted routes
- M17 (delete without token revocation) — no token management

---

### Performance And Maintainability Improvements

- `maxPoolSize: 1` on MongoDB connection (Lambda-appropriate)
- Double-check connection pattern prevents duplicate connections during concurrent cold-start
- Model registration guarded: `mongoose.models.Pet || mongoose.model(...)`
- Environment validation at cold start via Zod — misconfigured deployments fail fast
- `.lean()` on all read queries to avoid Mongoose document overhead
- `.select("-__v")` projections to exclude internal fields
- `lazyRoute()` keeps cold-start proportional to requested route
- Translation file caching at module level (read once per container lifetime)
- Structured JSON logging for CloudWatch parseability
- JWT `algorithms: ["HS256"]` explicitly set to block `alg:none` attacks
- JWT bypass blocked in production via `NODE_ENV !== "production"` guard

---

### Constraints And Deferred Work

| Item | Label | Description |
|------|-------|-------------|
| I20 — Race-condition duplicates | **not-applicable** | No creation flows in this Lambda. |

---

### Result Of This Stage

GetAllPets is structurally aligned with the UserRoutes baseline and all identified security defects are addressed. Unauthenticated mutations are JWT-protected, ownership is enforced via atomic query filters (mutations) and pre-DB path identity checks (reads), HTTP methods and route paths match the SAM contract, and the Environment block is declared in `template.yaml`. The Lambda follows the canonical request lifecycle, uses standardized response shapes with `errorKey`/`requestId`, structured logging, Zod v4 validation, and modular architecture.

Latest verification status:

- `49` integration tests passed
- `2` lifecycle tests skipped due to missing disposable production-safe fixture (`TEST_DISPOSABLE_PET_ID`)
- Full details are documented in `dev_docs/test_reports/GETALLPETS_TEST_REPORT.md`
