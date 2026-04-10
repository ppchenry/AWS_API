# PetBasicInfo Lambda — Refactoring Changelog

## Overview

Refactored the PetBasicInfo Lambda from a single 600-line god function in `index.js` into a modular architecture under `src/`. Every route, middleware, utility, and schema now lives in its own file with a single responsibility.

## 2026-04 Checklist Alignment

- aligned PetBasicInfo request flow to thin entry -> handler -> guard -> router -> service
- added explicit pet ownership and NGO access checks so valid JWTs can still receive `403`
- restored translated success messages while keeping standardized error responses with `errorKey` and `requestId`
- added structured logging for request boundaries, auth failures, DB failures, and unexpected service errors
- enabled explicit SAM events for `/pets/{petID}`, `/basic-info`, and `/eyeLog` routes including OPTIONS preflight coverage
- added a dedicated PetBasicInfo SAM integration suite for CORS, auth, ownership denial, invalid input, missing resources, update success, eye logs, and soft delete
- remaining work is now mostly operational verification and future API redesign, not structural instability

---

## Architecture

### Before (Legacy)

```text
index.js  — 600+ lines, all logic in one exports.handler
```

- One giant `switch/case` + `if/else` chain handling GET, PUT, DELETE, and eye log routes
- Inline validation (15+ manual `if` checks for the PUT body)
- No auth enforcement (authJWT existed but was commented out)
- Hardcoded `Access-Control-Allow-Origin: "*"` on some responses
- No separation between routing, validation, business logic, or response formatting

### After (Refactored)

```text
index.js           — 5 lines, delegates to handler
src/
  handler.js       — Orchestration: OPTIONS, auth, DB, petGuard, router
  router.js        — Declarative route table mapping method+path to service functions
  cors.js          — CORS origin validation and OPTIONS preflight handler
  config/db.js     — Singleton MongoDB connection with promise caching
  middleware/
    authJWT.js     — JWT verification and auth gating
    petGuard.js    — Pet ID validation, body parsing, pet existence/deleted check
  services/
    basicInfo.js   — GET, PUT, DELETE handlers for /basic-info and /
    eyeLog.js      — GET handler for /eyeLog
  utils/
    response.js    — createErrorResponse + createSuccessResponse helpers
    i18n.js        — Translation loading with per-container cache
    logger.js      — Structured JSON logging helpers
    validators.js  — Stateless validation helpers (ObjectId, date, URL, number, boolean)
    dateParser.js  — DD/MM/YYYY and ISO date parser
  zodSchema/
    petBasicInfoSchema.js — Zod schema for PUT body validation
  locales/
    en.json, zh.json
  models/
    pet.js, EyeAnalysisRecord.js
```text

---

## Security Improvements

| # | Improvement | Detail |
| - | ----------- | ------ |
| 1 | **Auth enforcement** | `authJWT()` is now wired into `handler.js` and runs globally on every request (except OPTIONS preflight). Previously it was commented out — all routes were fully public. |
| 2 | **CORS origin validation** | Replaced hardcoded `Access-Control-Allow-Origin: "*"` with env-based `ALLOWED_ORIGINS` allowlist. Credentials-aware: uses specific origin, never wildcard. |
| 3 | **JWT_BYPASS production guard** | `JWT_BYPASS=true` now only works when `NODE_ENV !== "production"`, preventing accidental auth bypass in prod. |
| 4 | **Removed sensitive logging** | Removed ~10 `console.log` statements from `cors.js` that were logging all request headers (including Authorization tokens) to CloudWatch. |
| 5 | **Auth error uses standardized response** | The 401 response from `authJWT` now uses `createErrorResponse` with CORS headers, instead of a manually built response that lacked CORS headers. |
| 6 | **Zod `.strict()` mode** | The update schema now rejects unknown fields entirely, preventing unexpected data from being written to the database. |
| 7 | **Proper type validation** | Replaced `z.any().refine()` with `z.number()` and `z.boolean()` for weight, contacts, sterilization, and boolean fields. Eliminates the risk of nested objects being passed through `$set`. |
| 8 | **Explicit field allowlist on GET** | `getPetBasicInfo` now returns an explicit allowlist of fields (matching the legacy response shape) instead of using spread + exclusion, which would leak any new schema fields added in the future. |
| 9 | **tagId/ngoPetId blocked at schema level** | Removed from the Zod schema entirely so they are rejected by `.strict()`. Previously they were accepted, validated, then silently stripped — wasting error messages and adding confusion. |

---

## Performance Improvements

| # | Improvement | Detail |
| - | ----------- | ------ |
| 1 | **`.lean()` on pet lookup** | `petGuard.js` now uses `Pet.findById(petID).lean()`, skipping Mongoose document hydration on every request. |
| 2 | **`.lean()` on eye log query** | `eyeLog.js` already used `.lean()` (added during refactor). |
| 3 | **Eye log query limit** | Added `.limit(100)` to prevent unbounded result sets for pets with many eye analysis records. |
| 4 | **Translation caching** | `loadTranslations()` now caches parsed JSON at module scope per language, so locale files are read from disk only once per Lambda container instead of every invocation. |
| 5 | **DB connection promise caching** | `db.js` now checks `mongoose.connection.readyState === 1` for instant return on warm containers, and caches the connection promise to prevent duplicate connection attempts during concurrent cold-start requests. |
| 6 | **OPTIONS fast-path** | `handleOptions()` runs before auth, DB connection, and all validation — preflight requests return instantly. |

---

## Code Quality Improvements

| # | Improvement | Detail |
| - | ----------- | ------ |
| 1 | **Consistent module system** | All files now use CommonJS (`require`/`module.exports`). Previously 6 files used ESM `import`/`export` while the rest used CJS — would fail without a bundler. |
| 2 | **Standardized response helpers** | `createErrorResponse` and `createSuccessResponse` in `response.js` ensure every response has consistent shape with CORS headers, translated success messages, and error traceability through `errorKey` plus `requestId`. |
| 3 | **Declarative route table** | Routes are defined as a plain object in `router.js` (`'GET /basic-info': getPetBasicInfo`). Adding a new route is one line. |
| 4 | **Zod schema validation** | Replaced 15+ inline `if` checks with a single `petBasicInfoUpdateSchema.safeParse(body)` call. All validation rules are co-located in one schema file. |
| 5 | **Centralized pet guard** | Pet ID validation, body parsing, pet existence check, and soft-delete check all happen once in `petGuard.js` instead of being duplicated across route branches. |
| 6 | **Thin handler** | `handler.js` only does: OPTIONS → auth → DB → petGuard → router → global catch. No business logic. |
| 8 | **Structured logs** | Request start/completion, DB failures, auth failures, and service exceptions now emit JSON logs with request context and serialized errors. |
| 7 | **i18n support** | Bilingual error/success messages (en/zh) loaded from locale JSON files with dotted-key resolution. |

---

## Legacy Code Removed (from original index.js)

- ~600 lines of commented-out god function (still present in `index.js` — safe to delete, it's in git history)
- Duplicate error handling (outer catch re-checked `ValidationError` and `CastError` that was already caught per-route)
- Unreachable code (`break` after `return` in switch cases)
- Dead null check (`if (!form)` — `form` was a just-created object literal, always truthy)
- Commented-out `ngoPetId` duplicate check logic
- Commented-out hard delete (`deleteOne`) logic
