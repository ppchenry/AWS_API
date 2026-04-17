### Security Audit — 20-Item Checklist (Pre/Post Modernization)

#### Critical (C1–C8)

**C1 — No JWT verification in handler**

* **Before:** No `jwt.verify` call. All 13 routes (detail info, transfer, source, adoption) were completely unauthenticated.
* **After:** `authJWT` middleware verifies every request before routing. `PUBLIC_RESOURCES = []` — no exceptions. Missing/invalid/expired tokens and `alg:none` attacks all return 401.

---

**C2 — Raw entity returned in responses**

* **Before:** Full Mongoose documents returned including `__v`, internal fields, and potentially joined user data with password hashes.
* **After:** `sanitizePetDetail`, `sanitizeSource`, `sanitizeAdoption` strip sensitive fields from all entity responses.

---

**C3 — Horizontal privilege escalation (pet ownership)**

* **Before:** Any caller could modify any pet's detail info, transfers, sources, and adoptions by supplying an arbitrary `petId`.
* **After:** `ownership.js` middleware runs after DB connection. Verifies `pet.userId === event.userId` OR `pet.ngoId === event.ngoId`. Returns 403 if neither matches. Attached `event._pet` eliminates redundant pet lookups in services.

---

**C4 — Unauthenticated hard delete**

* **Before:** DELETE on transfers and adoptions required no authentication.
* **After:** All DELETE routes require valid JWT. Hard delete behavior preserved (existing contract).

---

**C5–C8 — N/A for this Lambda**

C5 (session revocation), C6 (upsert takeover), C7 (entity enumeration) do not apply — PetDetailInfo has no session management, no upsert flows, and no public lookup endpoints.

**C8 — Authenticated user enumeration**

* **Before:** NGO transfer returned separate errors for missing email vs missing phone, enabling user enumeration.
* **After:** Returns a single generic 404 error regardless of which lookup failed. Email/phone identity is cross-validated (must be the same user).

---

#### High (H9–H13)

**H11 — Sensitive fields in update allowlists**

* **Before:** Request body fields were spread into `$set` operations without filtering. Attackers could inject `deleted`, `userId`, or other protected fields.
* **After:** All write endpoints use Zod schemas that explicitly enumerate allowed fields. Unrecognized fields are stripped.

---

**H12 — Password hash in responses**

* **Before:** NGO transfer looked up users and could leak full user documents.
* **After:** Sanitizers remove `password`, `__v`, and other sensitive fields.

---

**H13 — Missing RBAC on NGO transfer**

* **Before:** Any authenticated user could invoke the NGO ownership transfer.
* **After:** NGO transfer now requires `event.userRole === "ngo"`. Non-NGO callers receive 403.

---

H9 (caller-controlled role) and H10 (body identity trusted) do not apply to this Lambda.

---

#### Medium (M14–M17)

**M15 — Raw error messages leaked to client**

* **Before:** `catch` blocks returned `err.message` directly in response bodies.
* **After:** All errors go through `createErrorResponse` with locale error keys. Raw errors logged server-side via `logError`, never sent to client.

---

**M16 — Inconsistent response shape**

* **Before:** Some routes returned `{ form }`, others `{ message }`, others `{ petId }` — no consistent envelope.
* **After:** All responses use `createSuccessResponse`/`createErrorResponse` with `success`, `errorKey`, `requestId`, and CORS headers.

---

M14 (rate limiting) and M17 (token revocation) are N/A — all routes are authenticated and this Lambda does not manage tokens.

---

#### Structural (S18–I20)

**S18 — Fuzzy route matching**

* **Before:** Routes matched via `path.includes("/transfer")` which could match unintended paths.
* **After:** Exact key dispatch: `routeMap["POST /pets/{petId}/transfers"]`. No substring or regex matching.

---

**S19 — Monolithic entrypoint**

* **Before:** 1060-line `index.js` with connection, routing, validation, business logic, and responses interleaved.
* **After:** 4-line `index.js`. Full separation into handler → middleware → router → services → utils.

---

**I20 — Race-condition duplicate creation**

* **Before/After:** Creating a source or adoption record for a pet had no uniqueness check.
* **Status:** **MITIGATED (code-level)** — Services now check for existing records and return 409 before creation. A DB unique index on `petId` in `pet_sources`/`pet_adoptions` is still recommended for true concurrent-request safety.
