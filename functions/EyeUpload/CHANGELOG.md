# EyeUpload Lambda — CHANGELOG

## v1.1.2 — Template And Test Documentation Alignment

### v1.1.2 Fixes

| ID | Severity | Finding | Fix |
| ---- | -------- | ------- | --- |
| TPL-EYE-1 | Medium | `template.yaml` declared `PUT /pets/updatePetEye` under both `EyeUploadFunction` and `GetAllPetsFunction`, causing AWS SAM transform failure due to duplicate method/path registration | Removed the duplicate `UpdatePetEyePut` event from `EyeUploadFunction`; the EyeUpload router still keeps the legacy route mapped to `405` internally |
| DOC-EYE-1 | Low | EyeUpload API docs still described `/util/uploadImage` as requiring `petId` and allowing up to 5 files, which no longer matches the implementation | Updated API documentation to reflect the actual contract: one uploaded image, no `petId` field |
| DOC-EYE-2 | Low | EyeUpload docs still claimed there was no automated test coverage | Added an EyeUpload test report and updated docs to reflect current Jest + SAM integration coverage |

### v1.1.2 Verification

- Full EyeUpload suite verification: `90 passed, 4 skipped`
- Fixture-only rerun after updating `TEST_PET_ID` and `TEST_OWNER_USER_ID`: `4 passed`
- Combined evidence now covers all `94` tests in `__tests__/test-eyeupload.test.js`

---

## v1.1.1 — Second Security Pass

### v1.1.1 Security Fixes

| ID | Severity | Finding | Fix |
| ---- | -------- | ------- | --- |
| H-NGO1 | High | NGO callers whose JWT lacked an `ngoId` claim could submit any `form.ngoId`, trigger the NGO counter upsert, and persist that org onto the new pet | `createPetBasicInfoWithImage` now requires `event.ngoId` to be present on the JWT; missing claim returns 403 `ngoIdClaimRequired` |
| H-NGO2 | High | `updatePetImage` allowed an NGO owner of org A to reassign a pet to org B without proving JWT ownership of org B | Destination `ngoId` is now validated against `event.ngoId` from JWT; cross-org reassignment returns 403 |
| H-EYE | High | `eyeUploadAnalysis` performed no authorization on the supplied `petId`; any authenticated user could run analysis for any valid pet | Added pet ownership check: caller must own the pet or be its NGO via JWT `ngoId` claim |
| M-RL | Medium | `rateLimit.js` had no error handling around the Mongo upsert; concurrent bursts could surface E11000 as 500 | Added duplicate-key retry with `logError` fallback; defaults open on infra failure |
| M-ZOD | Medium | Multipart write routes (`createPetBasicInfoWithImage`, `updatePetImage`) accepted arbitrary fields without schema validation | Added Zod `.strict()` schemas (`petImageSchema.js`) that reject unknown fields and enforce type/length bounds; unknown or oversized fields return 400 |

### v1.1.1 New Files

- `src/zodSchema/petImageSchema.js` — Zod schemas for `createPetWithImageSchema` and `updatePetImageSchema`

### v1.1.1 New Locale Keys

`ngoIdClaimRequired`, `invalidInput` (en + zh)

---

## v1.1.0 — Security Hardening

### Breaking Changes

- **`POST /pets/create-pet-basic-info-with-image`**: The `userId` field in multipart form data is **no longer accepted**. Pet ownership is now derived from the JWT caller identity (`event.userId`). Clients that previously sent a `userId` field in the form body should remove it — the field is silently ignored.
- **`POST /analysis/eye-upload/{petId}`**: The `userId` field in multipart form data is **no longer accepted**. Audit logs and user validation use the JWT identity. Clients should remove the `userId` field from form submissions.
- **`POST /pets/updatePetImage`**: `isRegistered` field is no longer client-mutable. `ngoId` and `ngoPetId` mutations are restricted to NGO callers owning the pet.
- **`POST /util/uploadPetBreedImage`**: The `url` field is now validated against an allowlist of folder prefixes (`breed_analysis`, `pets`, `eye`, `profile`). Arbitrary S3 paths are rejected with 400.

### v1.1.0 Security Fixes

| ID | Severity | Finding | Fix |
| ---- | -------- | ------- | --- |
| C3 | Critical | `createPetBasicInfoWithImage` trusted form `userId` — any caller could create pets for another user | Pet owner is now JWT `event.userId`; form `userId` is ignored |
| C3b | Critical | `updatePetImage` had no ownership check — any caller could modify any pet | Added `pet.userId === event.userId` ownership check; NGO callers may update their org's pets |
| H10 | High | `eyeUploadAnalysis` trusted form `userId` for audit logs — attacker could impersonate any user in logs | Audit trail now uses JWT `event.userId` exclusively |
| H-S3 | High | `uploadPetBreedImage` accepted caller-controlled S3 keys with only `..` stripping | Replaced with allowlist of valid folder prefixes |
| M-VAL | Medium | `uploadImage` validated with `some()` across all files but only uploaded `files[0]` — validation mismatch | Now validates `files[0]` directly |
| M-RM | Medium | `updatePetImage` silently ignored malformed `removedIndices` | Returns 400 on non-array or non-integer indices |
| M-NGO | Medium | NGO counter upsert had no RBAC — any caller could advance another NGO's counter | Restricted to `event.userRole === "ngo"` with JWT `event.ngoId` claim required and matched |
| M-RL | Medium | No rate limiting on any route | Added per-action rate limiting on all 6 active routes via `enforceRateLimit` |
| M-MUT | Medium | `ngoId`, `isRegistered` were client-mutable in update path | `isRegistered` removed; `ngoId`/`ngoPetId` restricted to NGO owner with JWT ngoId match on destination |

### Rate Limits

| Route | Action Key | Limit | Window |
| ----- | ---------- | ----- | ------ |
| `POST /pets/create-pet-basic-info-with-image` | createPetWithImage | 20 | 5 min |
| `POST /pets/updatePetImage` | updatePetImage | 30 | 5 min |
| `POST /util/uploadImage` | uploadImage | 30 | 5 min |
| `POST /util/uploadPetBreedImage` | uploadPetBreedImage | 30 | 5 min |
| `POST /analysis/eye-upload/{petId}` | eyeUploadAnalysis | 10 | 5 min |
| `POST /analysis/breed` | breedAnalysis | 20 | 5 min |

### v1.1.0 New Files

- `src/models/RateLimit.js` — Rate limit schema with TTL index
- `src/utils/rateLimit.js` — `getClientIp`, `consumeRateLimit`, `enforceRateLimit`

### v1.1.0 New Locale Keys

`forbidden`, `rateLimited`, `invalidFolder`, `invalidRemovedIndices`, `ngoRoleRequired` (en + zh)

---

## v1.0.0 — In-Situ Modernization

### Scope

Full Tier 1 refactor of the EyeUpload Lambda (~1160 lines monolithic `index.js`) to match the UserRoutes baseline across all dimensions: security, structure, performance, maintainability, stability, and documentation.

**Not changed:** Mongoose model schemas (field definitions preserved), external API endpoint contracts, S3 bucket paths and naming conventions.

---

### Architecture Changes

| Before | After |
| ------ | ----- |
| Single monolithic `index.js` (~1160 lines) with all logic | Thin `index.js` (5 lines) → `handler.js` → `router.js` → 4 service modules |
| ESM (`import`/`export`) module system | CommonJS (`require`/`module.exports`) matching monorepo baseline |
| Fuzzy route matching via `.includes()` / `.path` checks | Exact route key dispatch: `"${httpMethod} ${event.resource}"` |
| `Access-Control-Allow-Origin: *` on all responses | Origin-allowlist CORS with 403 for disallowed origins |
| No structured logging | Structured JSON logs with `logInfo`, `logWarn`, `logError` |
| No environment validation | Zod-based env schema validated at cold start |
| Inline error responses with raw strings | `createErrorResponse`/`createSuccessResponse` with i18n (en/zh) |

**Request lifecycle:**

```text
1. context.callbackWaitsForEmptyEventLoop = false
2. CORS preflight (OPTIONS → 204 or 403)
3. JWT authentication (all routes protected)
4. Guard layer (petId validation, JSON parse for breed route)
5. DB connection (single pool, maxPoolSize: 1)
6. Route dispatch via lazyRoute()
7. Service execution
8. Catch-all error handler
```

---

### Functional Improvements

- **Bug fix**: Original `addImageFileToStorage(file, ...)` in eye analysis route passed raw `lambda-multipart-parser` file object (with `content`/`filename` properties) but the function expected `buffer`/`originalname`. Now all callers wrap files into the correct format.
- **Bug fix**: Original `updatePetImage` called `parseDDMMYYYY(form.adoptionStatus)` treating adoption status as a date. Fixed to direct assignment.
- **Duplicate check status code**: `ngoPetId` duplicate now returns 409 (Conflict) instead of 400 (Bad Request).
- **Deleted record filtering**: All user and pet lookups now filter `{ deleted: { $ne: true } }`.

---

### Validation and Error Handling Improvements

- JSON body for `/analysis/breed` is validated in the guard layer — returns 400 with `others.invalidJSON` instead of crashing with 500.
- `petId` path parameter for `/analysis/eye-upload/{petId}` is validated as a valid ObjectId in the guard — returns 400 before DB access.
- `petId` in multipart routes is validated in services before DB queries.
- All catch blocks use `logError` + `createErrorResponse(500, "others.internalError")` — no raw `error.message` or stack traces leak to clients.

---

### v1.0.0 Security Improvements

| ID | Finding | Status |
| ---- | ------- | ------ |
| C1 | No JWT verification | **Fixed** — `authJWT` enforces JWT on all routes, `algorithms: ["HS256"]` blocks `alg:none` |
| C2 | Raw entity returned | **Fixed** — sanitize helpers defined; no full user/pet documents exposed |
| C7 | Entity enumeration | **N/A** — no public lookup endpoints |
| H9 | Caller-controlled role | **Fixed** — role/deleted/credit fields never accepted from request body |
| H11 | Sensitive fields in edit allowlists | **Fixed** — `deleted`, `credit`, role fields excluded from update paths |
| H12 | Password hash in API responses | **Fixed** — sanitize helpers strip sensitive fields |
| M15 | Raw error messages leak | **Fixed** — all errors go through `createErrorResponse` |
| M16 | Inconsistent response shape | **Fixed** — all responses use standard `{ success, errorKey, error, requestId }` shape |
| S18 | Fuzzy route matching | **Fixed** — exact `"${method} ${resource}"` key matching |
| S19 | Monolithic entrypoint | **Fixed** — full separation into handler/router/services |

---

### Performance and Maintainability Improvements

- **Cold start**: `lazyRoute()` pattern — only the requested service module is loaded per invocation.
- **DB connection**: `maxPoolSize: 1` with double-check pattern prevents duplicate connections.
- **Model registration**: Guarded with `mongoose.models.X || mongoose.model(...)` — safe across warm starts.
- **Env validation**: Zod schema fails fast at cold start with structured error — no cryptic runtime errors.
- **Module system**: Converted from ESM to CJS to match monorepo baseline (UserRoutes, AuthRoute, etc.).

---

### Constraints and Deferred Work

| Item | Owner | Description |
| ---- | ----- | ----------- |
| I20 — Race-condition `ngoPetId` duplicate | `infra-owned` | Application-level check; only a DB unique index eliminates the race window |
| L — Zod 3 vs Zod 4 | `code-owned` | Using Zod 3.x; monorepo should coordinate upgrade to Zod 4 when ready |
| L — Split verification runs | `code-owned` | EyeUpload now has automated Jest + SAM coverage, but the current evidence is documented across a baseline run (`90 passed, 4 skipped`) plus a fixture-only rerun (`4 passed`) rather than one single all-green execution |

---

### Deprecated Routes

| Route | Status | Reason |
| ----- | ------ | ------ |
| `PUT /pets/updatePetEye` | 405 | Moved to GetAllPets Lambda |
| `GET /pets/gets3Image` | 405 | Belongs to PetLostandFound Lambda |
| `POST /pets/create-pet-basic-info` | 405 | Moved to CreatePetBasicInfo Lambda |
