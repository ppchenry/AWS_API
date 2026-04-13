# Changelog – EmailVerification Lambda

## [2.3.0] – 2026-04-13 — _id-based verification record uniqueness

### Scope

Removes dependence on a custom partial unique index for verification-code
uniqueness. The "one active code per email" invariant is now enforced by using
the normalized email as the document `_id`, leveraging MongoDB's built-in
`_id` uniqueness guarantee.

Files changed:
- `src/models/EmailVerificationCode.js` — `_id` = normalized email; removed
  custom partial unique index and compound lookup index
- `src/services/generateCode.js` — upsert by `{ _id: email }`; removed E11000
  catch/retry for partial index races
- `src/services/verifyCode.js` — atomic consume by `{ _id: email, codeHash, … }`
- `__tests__/test-emailverification.test.js` — all DB-backed tests use `_id`;
  added "repeated generate produces one record" and "repeated generate replaces
  code" tests
- `CHANGELOG.md` — this entry

Files not changed: index.js, handler.js, router.js, cors.js, config/,
middleware/, utils/, models/User.js, models/RefreshToken.js, models/RateLimit.js,
zodSchema/, locales/.

### Architecture Changes

`EmailVerificationCode` schema: `_id` is now `{ type: String }` set to the
normalized email. No separate `email` field. The custom partial unique index
`{ email: 1, unique: true, partialFilterExpression: { consumedAt: null } }` and
the compound lookup index `{ email, consumedAt, expiresAt }` are removed.

There is exactly one document per email in the collection. Generate overwrites
it; verify atomically consumes it.

### Functional Improvements

**Generate overwrites the single record.**
`findOneAndUpdate({ _id: email }, { $set: { codeHash, expiresAt, consumedAt: null } }, { upsert: true })`
— idempotent, no E11000 race handling needed.

**Verify consumes by primary key.**
`findOneAndUpdate({ _id: email, codeHash, consumedAt: null, expiresAt: { $gt: now } }, { $set: { consumedAt: now } })`
— atomic, uses the primary key index that always exists.

### Security And Correctness Impact

**Infra dependency removed:** The custom partial unique index on
`{ email }` where `consumedAt: null` is no longer needed for correctness.
Verification-record uniqueness relies solely on MongoDB's `_id` constraint,
which is guaranteed to exist on every collection without any index management.

**Infra dependency still present:** The `users.email` unique index is still
required for the E11000 race-safety fallback in `verifyCode.js` (concurrent
User creation). This was true before and is unchanged.

**No behavioral regressions:**
- Anti-enumeration (C7/C8): unchanged — uniform responses.
- Replay prevention: unchanged — `consumedAt: null` filter + atomic `$set`.
- C6 compliance: unchanged — no User writes during generate.
- Cookie path: unchanged — `/{stage}/auth/refresh`.

### Constraints And Deferred Work

- **TTL cleanup of consumed/expired records (infra-owned).** Without a TTL
  index on `expiresAt`, consumed records remain until overwritten by the next
  generate for that email. Since there is at most one record per email, storage
  growth is bounded. A TTL index is nice-to-have, not required for correctness.

- **Unique email index on `users` is required for race safety (infra-owned).**
  Unchanged from 2.2.0.

- **SMTP delivery is not transactional (code-owned).** Unchanged from 2.2.0.

- **No cross-collection transaction for verify (code-owned).** Unchanged from
  2.2.0.

### Result Of This Stage

Verification-record uniqueness per email now relies on MongoDB `_id`, which is
guaranteed to exist. One fewer hidden infra assumption. The design is simpler:
one document per email, overwritten on generate, atomically consumed on verify.

---

## [2.2.0] – 2026-04-13 — Dedicated verification store + cookie path fix (superseded by 2.3.0)

### Scope

Fixes three remaining audit failures against the UserRoutes baseline:
1. C6 violation: generate-email-code created placeholder User records via
   unauthenticated upsert.
2. Refresh cookie scoped to `/account/verify-email-code` instead of the
   repo-baseline `/auth/refresh` path consumed by AuthRoute.
3. Tests did not prove replay prevention or anti-enumeration with DB state.

Files changed:
- `src/models/EmailVerificationCode.js` — NEW: dedicated verification store
- `src/config/db.js` — registers EmailVerificationCode model
- `src/services/generateCode.js` — rewritten: no User upsert, stores in
  EmailVerificationCode collection
- `src/services/verifyCode.js` — rewritten: consumes from EmailVerificationCode,
  creates User only after successful verification
- `src/utils/token.js` — getCookiePath returns `/auth/refresh` (was
  `/account/verify-email-code`)
- `__tests__/test-emailverification.test.js` — rewritten with DB-backed Tier 2 tests

Files not changed: index.js, handler.js, router.js, cors.js, config/env.js,
middleware/authJWT.js, middleware/guard.js, utils/logger.js, utils/zod.js,
utils/validators.js, utils/i18n.js, utils/sanitize.js, utils/response.js,
utils/rateLimit.js, models/User.js, models/RefreshToken.js, models/RateLimit.js,
zodSchema/, locales/.

### Architecture Changes

New model: `EmailVerificationCode` — dedicated collection
(`email_verification_codes`) for temporary verification state. Indexes:
- `email + consumedAt + expiresAt` compound for lookup
- TTL index on `expiresAt` for automatic cleanup of expired records

Verification codes are no longer stored on the User document's `passwordReset`
field. The User `passwordReset` field is no longer written or read by this Lambda.

### Functional Improvements

**C6 fix: no User record creation during generate-email-code.**
`generate-email-code` no longer touches the `users` collection at all. It writes
only to `email_verification_codes`. An unauthenticated caller cannot create User
documents by submitting arbitrary emails.

**User creation deferred to verify-email-code, after successful code consumption.**
On successful verification:
- If a User already exists for the email, it is reused.
- If no User exists, one is created with server-controlled defaults only
  (role: "user", verified: true, credit: 300, etc.).
- E11000 race on User creation is handled: if a concurrent request created the
  User between findOne and save, the existing User is fetched and reused.

**Verification codes hashed before storage.**
The raw 6-digit code is SHA-256 hashed before being written to the DB. The
submitted code is hashed at verification time for comparison.

**Replay prevention is atomic.**
`findOneAndUpdate` with `{ email, codeHash, consumedAt: null, expiresAt: { $gt: now } }`
atomically sets `consumedAt`. A concurrent second request with the same code
finds zero matching documents.

**Refresh cookie path corrected.**
`getCookiePath` now returns `/{stage}/auth/refresh` (matching UserRoutes and the
AuthRoute refresh consumer), not `/{stage}/account/verify-email-code`.

### Validation And Error Handling Improvements

No changes from 2.1.0. Zod validation, guard layer, and structured error
responses remain intact.

### Security Improvements

- **C6 — Unauthenticated account creation**: FIXED. Generate-email-code does not
  create, upsert, or modify any User record.
- **C7/C8 — Anti-enumeration**: remains fixed. Uniform responses on both endpoints.
- **Replay prevention**: now provably atomic via dedicated collection with
  consumption flag, not dependent on User document's passwordReset field.
- **Code hashing**: verification codes stored as SHA-256 hashes.
- **Cookie path**: corrected to `/auth/refresh` matching repo baseline.
- **Cookie attributes**: SameSite=Strict, HttpOnly, Secure unchanged.

### Performance And Maintainability Improvements

- Generate flow is a single `findOneAndUpdate` upsert on the verification collection.
  No User queries at all during generation.
- Verification collection benefits from TTL auto-cleanup.

### Constraints And Deferred Work

- **SMTP delivery is not transactional with verification record write (code-owned).**
  If the DB write succeeds but SMTP fails, the verification record exists but the
  user never receives the code. They can retry. The 503 response makes this visible.

- **No atomic guarantee across User creation, verified-state update, and refresh
  token creation (code-owned).** The verify flow performs up to three sequential
  writes: (1) consume verification record, (2) create or update User, (3) save
  RefreshToken. If step 2 or 3 fails after step 1, the code is consumed but no
  token is issued. The user must re-generate and re-verify. Risk is low and
  self-healing. MongoDB shared tier does not support cross-collection transactions.

- **TTL index on `expiresAt` in `email_verification_codes` is required (infra-owned).**
  Without the TTL index, expired records accumulate. The application still checks
  expiry in the query filter, so correctness is not affected, but storage grows.

- **Unique email index on `users` is required for race safety (infra-owned).**
  The E11000 fallback in verifyCode.js depends on this index existing.

- **SameSite=Strict may restrict cross-origin cookie delivery (code-owned, deferred).**
  Matches UserRoutes baseline. If cross-origin flow is needed, requires documented
  exception.

### Result Of This Stage

The EmailVerification Lambda no longer creates User records before verification
(C6 fixed). Verification codes live in a dedicated collection with atomic
one-time consumption. The refresh cookie is scoped to `/auth/refresh` matching
the repo baseline. Tests include DB-backed assertions that prove no-user-creation
during generate, replay prevention, user-creation-only-after-verify, existing-user
reuse, expired/consumed code rejection, and cookie path correctness.

---

## [2.1.0] – 2026-04-13 — Security audit fix pass (superseded by 2.2.0)

Superseded. See 2.2.0 for the correct implementation. This version still used
placeholder User upserts during generate and scoped the cookie to the wrong path.

---

## [2.0.0] – 2025-07-17 — Tier 1 Full Separation refactor

### Architecture

- Tier 1 Full Separation refactor following `REFACTOR_CHECKLIST.md`.
- `index.js` reduced to a 4-line entry point delegating to `src/handler.js`.
- Canonical lifecycle: CORS → authJWT → guard → DB → routeRequest.
- Exact-key route dispatch via `src/router.js`.
- `lazyRoute()` pattern for on-demand service loading.

### Merged endpoints

- `/account/generate-email-code` and `/generate-email-code-2` merged into one.
- `/account/generate-email-code-2` frozen at HTTP 405.

### New endpoint

- `POST /account/verify-email-code` explicitly routed (was previously unnamed else branch).

### Files added

```text
src/handler.js, src/router.js, src/cors.js
src/config/env.js, src/config/db.js
src/middleware/authJWT.js, src/middleware/guard.js
src/services/generateCode.js, src/services/verifyCode.js
src/utils/logger.js, src/utils/zod.js, src/utils/validators.js
src/utils/i18n.js, src/utils/sanitize.js, src/utils/response.js
src/utils/rateLimit.js, src/utils/token.js
src/models/User.js, src/models/RefreshToken.js, src/models/RateLimit.js
src/zodSchema/envSchema.js, src/zodSchema/emailSchema.js
src/locales/en.json, src/locales/zh.json
```
