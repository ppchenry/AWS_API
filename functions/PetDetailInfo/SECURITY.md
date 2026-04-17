### Legacy Security Audit - Modernization Before/After Table

This document summarizes the current security posture of `functions/PetDetailInfo` after the UserRoutes-style refactor and the 82-case SAM integration test run.

The findings below follow the same classification style as `functions/UserRoutes/SECURITY.md`: each legacy risk is mapped to the current mitigation, or marked as not applicable where the Lambda does not own that kind of flow.

#### Critical Risks (C1-C8)

**Finding C1 - Handler routes without enforced JWT verification**

* **Before modernization:** Protected pet detail, transfer, source, and adoption routes were handled inside a monolithic Lambda shape where authentication and route logic were tightly coupled and difficult to audit consistently.
* **After modernization:** `authJWT` runs before every non-OPTIONS route. `PUBLIC_RESOURCES = []` is explicit in `handler.js`. JWT verification pins HS256 and rejects missing headers, malformed Bearer values, expired tokens, wrong-secret tokens, and `alg:none` attacks with `401 others.unauthorized`.

---

**Finding C2 - Raw or over-broad entity data returned**

* **Before modernization:** Detail/source/adoption responses risked returning broader DB documents than the frontend contract required because projection and sanitization boundaries were not centralized.
* **After modernization:** Reads use explicit projections and service responses pass data through `sanitizePetDetail`, `sanitizeSource`, or `sanitizeAdoption`. Adoption reads now use an explicit `ADOPTION_PROJECTION`. User lookup data in NGO transfer selects `_id` only and is never returned to the client.

---

**Finding C3 - Horizontal privilege escalation on pet-owned resources**

* **Before modernization:** A caller could target another pet by changing `petID` unless every route branch remembered to perform the same ownership check.
* **After modernization:** `ownership.js` loads the pet after DB connection and before route dispatch. It requires `pet.userId === event.userId` or `pet.ngoId === event.ngoId`. A mismatch returns `403 others.forbidden`; a missing or deleted pet returns `404 petNotFound`.

---

**Finding C4 - Destructive operations without object-level authorization**

* **Before modernization:** Transfer and adoption delete paths were high-risk because destructive writes were not protected by one shared DB-backed ownership boundary.
* **After modernization:** All delete operations require valid JWT and ownership before service execution. Transfer delete uses the full guarded predicate `{ _id: petID, deleted: false, "transfer._id": transferId }` and checks `matchedCount`. Adoption delete uses `_id + petId` and checks `deletedCount`.

---

**Finding C5 - Session/token revocation after delete**

* **Before modernization:** This class applies to Lambdas that own user sessions or refresh tokens.
* **After modernization:** Not applicable. PetDetailInfo does not issue tokens, store refresh tokens, or manage user sessions.

---

**Finding C6 - Upsert-based account or ownership takeover**

* **Before modernization:** This class applies to registration/auth flows that create or upsert identities.
* **After modernization:** Not applicable. PetDetailInfo has no upsert-based account creation flow. Source/adoption create operations are normal document creates and are ownership-gated before service execution.

---

**Finding C7 - Public entity enumeration**

* **Before modernization:** Public unauthenticated lookup routes can leak whether a target record exists.
* **After modernization:** Not applicable for general route access because PetDetailInfo has no public non-OPTIONS routes. All reads and writes require JWT and pet ownership.

---

**Finding C8 - Target user enumeration in NGO transfer**

* **Before modernization:** NGO transfer could leak whether a submitted email or phone number matched a user if different errors were returned for each missing identity.
* **After modernization:** NGO transfer returns the same neutral `404 ngoTransfer.targetUserNotFound` when either email or phone lookup misses. It also requires both email and phone to resolve to the same `_id`, otherwise returning `400 ngoTransfer.userIdentityMismatch`.

---

#### High Severity (H9-H13)

**Finding H9 - Caller-controlled role or privilege assignment**

* **Before modernization:** This class applies when request bodies can assign privileged roles or ownership.
* **After modernization:** No client-submitted role is used for privilege assignment. NGO authority comes only from the verified JWT `userRole` claim and is checked in `guard.js`.

---

**Finding H10 - Body-provided identity trusted as caller authority**

* **Before modernization:** Body identity fields can be dangerous if they are used to decide who is allowed to mutate a resource.
* **After modernization:** Caller authority is derived from JWT claims and DB-loaded pet state, not request body identity fields. NGO transfer target identity (`UserEmail`, `UserContact`) is treated as business data for the recipient and does not authorize the caller.

---

**Finding H11 - Sensitive fields exposed in update allowlists**

* **Before modernization:** Broad update objects or raw body spreading could allow mass assignment of fields such as `deleted`, `userId`, `ngoId`, or internal status fields.
* **After modernization:** Zod schemas expose only route-specific fields and services build explicit update maps. Unknown fields are stripped. If stripping leaves no valid update fields, update routes return `400 others.noFieldsToUpdate`, `petSource.noFieldsToUpdate`, or `petAdoption.noFieldsToUpdate`.

---

**Finding H12 - Sensitive user data returned by transfer lookup**

* **Before modernization:** NGO transfer needs to look up a target user by email and phone; returning or selecting full user documents could leak sensitive fields.
* **After modernization:** Target user lookups select `_id` only. No user document, password hash, deleted flag, or profile data is returned from the NGO transfer service.

---

**Finding H13 - Missing RBAC on NGO-only operations**

* **Before modernization:** NGO transfer behavior could be implemented inside service logic only, making it easier for route branches to drift.
* **After modernization:** `guard.js` contains `NGO_ONLY_RESOURCES` and rejects valid non-NGO tokens with `403 others.ngoOnly` before DB connection and before ownership/service logic.

---

#### Medium Severity (M14-M17)

**Finding M14 - Missing rate limiting**

* **Before modernization:** Public credential, code-dispatch, or destructive unauthenticated routes usually require rate limiting.
* **After modernization:** Not applicable as a public-abuse control because this Lambda has no public non-OPTIONS route and no credential/code-dispatch flow. All operations require JWT, and destructive operations are ownership-gated. If future public routes are added, they must follow the UserRoutes rate-limit pattern.

---

**Finding M15 - Raw internal error messages returned**

* **Before modernization:** Catch blocks in monolithic handlers often risk returning `e.message` or inconsistent raw errors to clients.
* **After modernization:** Services log server-side details and return centralized `others.internalError` responses. Client-facing errors use stable `errorKey` values and translated messages.

---

**Finding M16 - Inconsistent status codes and response shape**

* **Before modernization:** Mixed response payloads make frontend handling, LLM automation, and tests brittle.
* **After modernization:** All service responses use `createSuccessResponse` or `createErrorResponse`. Errors include `success: false`, `errorKey`, `error`, and `requestId` when Lambda context provides it. Success responses include `success: true`.

---

**Finding M17 - Delete logic without session impact**

* **Before modernization:** Account deletion routes must revoke related sessions.
* **After modernization:** Not applicable. PetDetailInfo deletion routes do not delete user accounts or manage sessions. They delete transfer/adoption domain records only after JWT and pet ownership checks.

---

#### Structural Risks (S18-S19)

**Finding S18 - Fuzzy route matching**

* **Before modernization:** Monolithic route logic commonly uses `includes()` or branch-order checks that can send requests to the wrong handler.
* **After modernization:** `router.js` dispatches by exact key: `"${event.httpMethod} ${event.resource}"`. Unsupported method/resource pairs that reach the Lambda return `405 others.methodNotAllowed`.

---

**Finding S19 - Monolithic Lambda coupling all security-sensitive behavior**

* **Before modernization:** Routing, validation, DB access, ownership checks, business logic, and response handling were coupled in one large file, increasing regression risk.
* **After modernization:** `index.js` delegates to `src/handler.js`; responsibilities are split across middleware, services, config, utils, schemas, models, and locales. The request lifecycle is explicit: OPTIONS -> authJWT -> guard -> DB -> ownership -> router -> service.

---

#### Additional PetDetailInfo-Specific Risk

**Finding I20 - Duplicate source/adoption records under concurrent create**

* **Before modernization:** Source and adoption create flows could create duplicate records for the same pet.
* **After modernization:** Create services run Zod validation first, then use the shared `checkDuplicates()` helper and return `409 petSource.duplicateRecord` or `409 petAdoption.duplicateRecord` for normal duplicate requests. The remaining risk is infra-owned: true concurrent-request safety still requires unique indexes on `pet_sources.petId` and `pet_adoptions.petId`.

---

#### Verified Security Behaviors

The integration suite `__tests__/test-petdetailinfo.test.js` passed all 82 tests and verifies:

* CORS allowed/disallowed/missing-origin behavior
* missing, expired, malformed, wrong-secret, no-Bearer-prefix, and `alg:none` JWT rejection
* invalid ObjectId rejection for `petID`, `transferId`, `sourceId`, and `adoptionId`
* malformed JSON and empty body rejection
* cross-owner access denial on detail, transfer, source, and adoption routes
* NGO transfer guard-layer RBAC
* strict date validation for DD/MM/YYYY, YYYY-MM-DD, and supported ISO timestamp inputs
* duplicate source/adoption `409` responses
* transfer delete `matchedCount` behavior
* source/adoption `petId`-scoped writes
* unknown-field stripping / mass-assignment resistance
* NoSQL operator-shaped payload rejection or scalar treatment

Latest verified result:

```text
PASS  __tests__/test-petdetailinfo.test.js (114.624 s)
Test Suites: 1 passed, 1 total
Tests:       82 passed, 82 total
```

#### Residual Risk

The only known residual item is infra-owned: add unique indexes on `pet_sources.petId` and `pet_adoptions.petId`. Without those indexes, two concurrent create requests can still pass the application-level duplicate check before either insert commits.
