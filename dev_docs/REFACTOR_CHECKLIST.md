# Lambda In-Situ Modernization Spec

This document is the authoritative refactor specification for the mass In-Situ Modernization of the inventory-scoped Lambdas in this monorepo. Use `dev_docs/LAMBDA_REFACTOR_INVENTORY.md` for the current completed/remaining count. The baseline for every dimension — security, structure, performance, maintainability, scalability, stability, documentation — is the current `functions/UserRoutes` implementation after its full security audit and integration suite.

Feed this file directly to an LLM as a system prompt. Replace the placeholders in the Direct Prompt Template below, attach the target Lambda files, and instruct the model to execute.

---

## Lambda Tier Classification

Do not apply the same structural depth to every Lambda. Use the tier from `LAMBDA_REFACTOR_INVENTORY.md` to right-size the output.

### Tier 1 — Full Separation (entry lines > ~500)

Apply the complete UserRoutes-style layout:

```
functions/{Lambda}/
  index.js                       ← 4–6 lines, just exports.handler
  package.json
  src/
    handler.js                   ← orchestration, PUBLIC_RESOURCES, lifecycle stages
    cors.js                      ← corsHeaders(), handleOptions()
    router.js                    ← lazyRoute(), routes map, routeRequest()
    config/
      db.js                      ← singleton Mongoose connection, model registration
      env.js                     ← Zod env schema validation at startup
    middleware/
      authJWT.js                 ← JWT verify, JWT_BYPASS dev guard, _attachUserToEvent()
      guard.js                   ← JSON parse, empty-body check, path param validation, optional RBAC and ownership checks
      selfAccess.js              ← only if Lambda has ownership-based access control
    services/
      {domain}.js                ← one file per business workflow
    models/
      {Model}.js                 ← Mongoose schema definitions
    utils/
      response.js                ← always required
      logger.js                  ← always required
      zod.js                     ← always required when using Zod validation
      sanitize.js                ← required whenever endpoints return DB documents
      validators.js              ← required when normalizing or validating input fields
      i18n.js                    ← required when Lambda has locale files
      rateLimit.js               ← only if Lambda has public or sensitive write flows
      token.js                   ← only if Lambda issues JWTs or refresh tokens
      duplicateCheck.js          ← only if Lambda performs pre-write uniqueness checks
    zodSchema/
      {domain}Schema.js          ← Zod schemas, error messages are locale dot-keys only
    locales/
      en.json                    ← only if Lambda has i18n
      zh.json                    ← only if Lambda has i18n
```

### Tier 2 — Partial Separation (entry lines 200–500)

Apply the same lifecycle ordering and behavioral standards, but keep structure lighter:

- thin `index.js`
- `src/handler.js` for orchestration
- `src/router.js` only if route count or branching justifies it
- services only if business logic is meaningfully separated
- all utils, config, and middleware patterns still apply

### Tier 3 — Keep Simple (entry lines < ~200)

Do not restructure, but still enforce all the behavioral standards:
- validation before business logic, `400` not `500` on bad input
- structured logging
- centralized response shape
- auth and CORS ordering
- DB connection reuse
- sanitized outbound payloads

---

## Canonical Request Lifecycle

Every Lambda must implement the same lifecycle stages, but there is one allowed placement variation learned from the first completed refactors: **cheap, DB-free request validation should run before the DB connection**, while **DB-backed ownership checks may run only after the DB is available**. Do not force a DB-backed ownership lookup into the pre-DB guard layer.

```
1. context.callbackWaitsForEmptyEventLoop = false
   event.awsRequestId = context.awsRequestId

2. CORS Preflight (OPTIONS)
   → handleOptions(event)
   → if response: return immediately with 204 or 403
   → OPTIONS must never reach auth

3. JWT Authentication
   → authJWT({ event })
   → attaches JWT claims to event — at minimum event.userId; include only the claims this Lambda's services actually read
   → if error AND route is not in PUBLIC_RESOURCES: return 401
   → PUBLIC_RESOURCES is an explicit allowlist, not a pattern match
   → if all routes are protected, PUBLIC_RESOURCES is an empty array

4. Guard Layer (cheap, no DB)
   → validateUserRequest({ event })
   → parse JSON body, return 400 on malformed JSON
   → reject empty body on POST/PUT routes that require one, return 400
  → [if ownership check only compares JWT identity to path/body fields] run it here, return 403 on mismatch
  → [if Lambda has role-restricted routes] run RBAC check, return 403 on role mismatch
   → [if Lambda has ObjectId path params] validate format, return 400 on invalid

5. DB Connection
  → await getReadConnection()
  → maxPoolSize: 1 for Lambda
  → register models on first connection only

6. Route Dispatch
   → routeRequest({ event, body })
   → key format: "${event.httpMethod} ${event.resource}"
   → exact string match, no includes() or regex
   → null routes return 405 methodNotAllowed
   → lazyRoute() pattern: require() inside the dispatch closure

7. Service Execution
   → enforceRateLimit() first on public/sensitive workflows
  → [if ownership requires loading a DB resource] do that ownership check now, before mutation or expensive reads
   → Zod safeParse() before business logic
   → normalizeEmail()/normalizePhone() before DB lookups
   → checkDuplicates() before write operations
   → business logic
   → sanitize{Entity}() before returning any entity payload
   → createSuccessResponse() or createErrorResponse()

8. Catch-all
   → logError("Unhandled request error", { scope, event, error })
   → return createErrorResponse(500, "others.internalError", event)
```

---

## Module-Level Implementation Standards

### `index.js`

```js
const { handleRequest } = require("./src/handler");
exports.handler = async (event, context) => handleRequest(event, context);
```

Must not contain any business logic, routing, or imports beyond the handler delegation. Maximum 6 lines.

---

### `src/handler.js`

- Call `require("./config/env")` at the top to trigger env validation at cold start.
- Define `PUBLIC_RESOURCES` as a plain array of exact `event.resource` strings. Do not use path prefix matching or regex.
- Never put JWT bypass logic here. It belongs in `authJWT.js`.
- If the Lambda's guard only performs JSON parse, empty-body validation, cheap RBAC, and ObjectId format checks, run the guard before opening the DB connection so malformed requests fail without touching MongoDB.
- If ownership validation requires fetching a DB document first, do not force that lookup into the handler-level guard just to satisfy a rigid stage order.
- The `try/catch` at the outer level must log with `logError` and return `createErrorResponse(500, "others.internalError", event)`.
- Always set `context.callbackWaitsForEmptyEventLoop = false`.
- Always copy `context.awsRequestId` onto `event.awsRequestId` before any middleware runs.

---

### `src/cors.js`

- Read `ALLOWED_ORIGINS` from `process.env.ALLOWED_ORIGINS`, split on comma, trim each origin.
- `corsHeaders(event)`: compare `event.headers?.origin` case-insensitively against the list. Return CORS headers only for allowed origins, empty object otherwise.
- `handleOptions(event)`: on `httpMethod === "OPTIONS"`, return 204 with CORS headers if origin is allowed, 403 if origin is disallowed or missing.
- Always include CORS headers on all responses — `createErrorResponse` and `createSuccessResponse` must call `corsHeaders(event)`.

---

### `src/middleware/authJWT.js`

Exact behavioral contract from UserRoutes:

- Skip verification for `OPTIONS` — return `null` immediately.
- If `JWT_BYPASS === "true"` AND `NODE_ENV !== "production"`: attach a dev identity and return `null`. Log `logWarn` when bypass is active. Never allow bypass in production.
- Extract `Authorization` or `authorization` header. Require `Bearer ` prefix. Return `createErrorResponse(401, "others.unauthorized", event)` if missing or malformed.
- Call `jwt.verify(token, process.env.JWT_SECRET)` with `algorithms: ["HS256"]` explicitly to block `alg:none` attacks. Return 401 on any thrown error including expiry.
- If `JWT_SECRET` is missing from env, log `logError` and return `createErrorResponse(500, "others.internalError", event)`.
- Call `_attachUserToEvent(event, decoded)` on success. At minimum set:
  - `event.user = decoded`
  - `event.userId = decoded.userId || decoded.sub`
  Include only the additional claims that this Lambda's services or guard actually read (e.g. `event.userRole` if RBAC is needed, `event.ngoId` if NGO ownership is checked). Do not attach claims that no downstream code uses.

---

### `src/config/env.js`

- Call `envSchema.safeParse(process.env)` at module load time. On failure, log the validation errors with `logError` and throw. This makes misconfigured deployments fail fast with a useful message instead of a cryptic runtime error.
- Define `envSchema` in `src/zodSchema/envSchema.js` using Zod. Required fields must be non-empty strings. Optional fields should have appropriate defaults or `.optional()`.
- Required fields for most Lambdas: `MONGODB_URI`, `JWT_SECRET`, `ALLOWED_ORIGINS`. Add Lambda-specific fields such as `AWS_BUCKET_NAME`, `TWILIO_*`, `REFRESH_TOKEN_MAX_AGE_SEC` as needed.
- Export `parsed.data`, not `process.env`, from `env.js`.

---

### `src/config/db.js`

Exact pattern from UserRoutes:

```js
let conn = null;
let connPromise = null;

const connectToMongoDB = async () => {
  if (conn && mongoose.connection.readyState === 1) return conn;
  if (connPromise) return connPromise;

  connPromise = (async () => {
    try {
      conn = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 1,
      });
      // Register all models for this Lambda here, guarded with mongoose.models.X ||
      return conn;
    } catch (error) {
      connPromise = null;
      conn = null;
      throw new Error("Failed to connect to database");
    }
  })();

  return connPromise;
};
```

- `maxPoolSize: 1` is mandatory for Lambda to prevent connection pool exhaustion.
- Model registration must be guarded: `mongoose.models.User || mongoose.model("User", UserSchema, "users")`.
- Register all models required by this Lambda in `db.js`, not in individual service files.
- Log connection success and failure with `logInfo` / `logError`.
- The double-check pattern (`conn && readyState === 1` + `connPromise`) prevents duplicate connections during concurrent cold-start requests.

---

### `src/middleware/guard.js`

Implement in this order:

1. **JSON body parse**: if body is a non-empty string, `JSON.parse()`. On `SyntaxError`, return `createErrorResponse(400, "others.invalidJSON", event)`.
2. **Empty body check**: if `PUT` or `POST` and `parsedBody` is null or has no keys, return `createErrorResponse(400, "others.missingParams", event)`. Apply only to routes that actually require a body.
3. **Ownership/self-access check** _(include only if Lambda has ownership-based routes and the check is DB-free)_: invoke the ownership check here only when it compares JWT identity against path/body fields already present on the event. Return 403 on mismatch. If the check requires loading a DB resource first, perform it later through `selfAccess.js` or a service-start helper after the DB connection is ready.
4. **RBAC check** _(include only if Lambda has role-restricted routes)_: define a `Set` of exact `event.resource` strings per role tier. Return 403 when the caller's role is insufficient. Omit this step if all authenticated routes are accessible to any valid caller.
5. **Path parameter validation** _(include only if Lambda uses ObjectId path params)_: validate that path ObjectId params are well-formed before the service is reached. Return 400 on invalid format. Use `mongoose.isValidObjectId()`.

Preserve the Lambda's existing `errorKey` contract when applying these checks. If the Lambda already exposes domain-scoped keys such as `petBasicInfo.errors.invalidJSON`, do not force-migrate them to shared `others.*` keys in the same refactor pass unless contract change is explicitly approved.

---

### `src/middleware/selfAccess.js` _(include only if Lambda has ownership-based access control)_

- Define `SELF_ACCESS_POLICIES` as a plain object map from route key to policy type. The policy type names the field used for comparison: a path param, a body field, or a normalized identifier.
- For each policy type, compare the caller identity from the JWT (`event.userId` or equivalent) against the target identity from the path param or body field. Return 403 on mismatch. Skip silently if the relevant field is absent.
- Normalize identifiers (e.g. email: `.trim().toLowerCase()`) before comparing.
- Routes not in the policy map always return `{ isValid: true }` — self-access is opt-in.
- If ownership depends on a fetched resource rather than a path/body field already present on the event, `selfAccess.js` may expose a DB-backed helper such as `loadAuthorizedEntity()` and that helper should be called at the start of the service after DB bootstrap.

---

### `src/router.js`

Exact pattern from UserRoutes:

```js
function lazyRoute(modulePath, exportName) {
  return async function routeHandler(ctx) {
    const service = require(modulePath);
    return await service[exportName](ctx);
  };
}

const routes = {
  "GET /resource/{id}": lazyRoute("./services/resource", "getResource"),
  "PUT /resource/{id}": lazyRoute("./services/resource", "updateResource"),
  "POST /resource/deprecated-path": null,  // null = 405
};

async function routeRequest(routeContext) {
  const { event } = routeContext;
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const routeAction = routes[routeKey];

  if (!routeAction) {
    return createErrorResponse(405, "others.methodNotAllowed", event);
  }
  return await routeAction(routeContext);
}
```

- Route keys use `event.resource` (the API Gateway template path like `/account/{userId}`), not `event.path` (the actual URL).
- `null` entries are intentional: they represent known-but-unsupported routes that should return 405 rather than fall through to a generic 405.
- Never use `includes()`, `startsWith()`, or regex for route matching.
- `lazyRoute` avoids loading every service module on every invocation, which keeps cold-start overhead proportional to the requested route.
- If local SAM or API Gateway would otherwise reject a known-but-frozen method before the Lambda runs, add the corresponding event in `template.yaml` so the handler can return the intended `405` response. Do not assume infra-level `403` is an acceptable substitute when the contract or tests expect Lambda-level `405`.

---

### `src/services/{domain}.js`

Each service function receives `{ event, body }` and must follow this internal order:

1. **Rate limiting** (on public or sensitive routes):
   ```js
   const rateLimit = await enforceRateLimit({ event, action: "login", limit: 5, windowSec: 300 });
   if (!rateLimit.allowed) return createErrorResponse(429, "others.rateLimited", event);
   ```

2. **Zod validation**:
   ```js
   const parseResult = schema.safeParse(body);
   if (!parseResult.success) {
     return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
   }
   const { field1, field2 } = parseResult.data;
   ```

3. **Normalization** _(only if the service handles email or phone fields)_: call `normalizeEmail()` and `normalizePhone()` before any DB lookup or write involving those fields.

4. **Duplicate checking** _(only if the service writes records that must be unique)_: use `checkDuplicates()` from `utils/duplicateCheck.js`. Return 409 on conflicts. Skip if the service does not create or update uniqueness-constrained records.

5. **Business logic**: DB queries use focused projections. Fetch only required fields. Guard against deleted/inactive records.

6. **Response sanitization**: call `sanitize{Entity}()` on any entity returned in the response. Never return `password`, internal flags, or system fields.

7. **Success response**:
   ```js
   return createSuccessResponse(200, event, { result: sanitize{Entity}(entity) });
   ```

8. **Catch block**: log `logError` with scope, event, and error. Return `createErrorResponse(500, "others.internalError", event)`.

Do not hardcode role values in service logic. Role checks belong in `guard.js`.

---

### `src/utils/response.js`

Both functions must match the UserRoutes shape exactly.

`createErrorResponse(statusCode, error, event)`:
```json
{
  "success": false,
  "errorKey": "<locale-dot-key>",
  "error": "<translated string or key if translation missing>",
  "requestId": "<context.awsRequestId if present>"
}
```

`createSuccessResponse(statusCode, event, data, extraHeaders)`:
```json
{
  "success": true,
  ...data
}
```

Both functions must call `corsHeaders(event)` and merge headers. `createErrorResponse` must call `loadTranslations()` and `getTranslation()`.

---

### `src/utils/logger.js`

Structured JSON log format matching UserRoutes:

```json
{
  "timestamp": "ISO 8601",
  "level": "info|warn|error",
  "message": "...",
  "scope": "module.function",
  "request": {
    "requestId": "...",
    "method": "POST",
    "resource": "/account/login",
    "userId": "...",
    "userEmail": "...",
    "userRole": "..."
  },
  "error": {
    "name": "...",
    "message": "...",
    "code": "...",
    "stack": "..."
  },
  "extra": {}
}
```

Expose `logInfo`, `logWarn`, `logError` as named exports. All accept `(message, { scope, event, error, extra })`. Use `console.log/warn/error` as the underlying writer so CloudWatch picks up the level correctly.

Do not log secrets, passwords, tokens, or full request bodies.

---

### `src/utils/sanitize.js`

Define one sanitize function per entity type. The user sanitizer is the canonical example:

```js
function sanitizeUser(user) {
  if (!user) return user;
  const rawUser = typeof user.toObject === "function" ? user.toObject() : user;
  const { password, ...safeUser } = rawUser;
  return safeUser;
}
```

Apply the same pattern for any other entity that has sensitive internal fields (`tokenHash`, `deleted`, `credit`, `internalStatus`, etc.). Sanitize at the service boundary before passing data to `createSuccessResponse`. Never trust that callers will remember to strip fields after the fact.

---

### `src/utils/rateLimit.js`

Exact pattern from UserRoutes:

- Key format: `${clientIp}:${identifier}` where identifier is typically the user email or "anonymous".
- Use a dedicated `RateLimit` Mongoose model with fields: `action`, `key`, `windowStart`, `count`, `expireAt`. Add a TTL index on `expireAt`.
- `getClientIp(event)`: read `x-forwarded-for` first (first IP in the comma-separated list), then fall back to `event.requestContext.identity.sourceIp`.
- `toWindowStart(nowMs, windowSec)`: floor current timestamp to the nearest window start.
- `consumeRateLimit`: use `findOneAndUpdate` with `$inc: { count: 1 }` and `$setOnInsert: { expireAt }`. Use `upsert: true, new: true, setDefaultsOnInsert: true, lean: true`. Return `{ allowed: entry.count <= limit, count }`.
- Apply rate limiting on any public or unauthenticated write flow, and on any sensitive authenticated flow (e.g. credential changes, code dispatch, file uploads). This module is not needed if the Lambda has no such flows.
- Use distinct `action` strings per operation so limits are independent. Choose action names that describe this Lambda's specific workflows.

---

### `src/utils/zod.js`

Zod v4 uses `error.issues`, not `error.errors`. Always use the UserRoutes helpers:

```js
function getFirstZodIssueMessage(error, fallback = "Invalid input") {
  return (Array.isArray(error?.issues) ? error.issues : [])[0]?.message || fallback;
}
function getJoinedZodIssueMessages(error, fallback = "Invalid input") { ... }
```

Never call `error.errors` anywhere in the codebase.

---

### `src/zodSchema/{domain}Schema.js`

- All error messages in Zod schemas must be locale dot-keys, not raw English strings:
  ```js
  z.string({ error: "register.errors.firstNameRequired" }).min(1, "register.errors.firstNameRequired")
  ```
- Preserve the Lambda's existing error-key taxonomy unless a cross-Lambda standardization change is explicitly approved. Refactoring is not the time to rename public `errorKey` values casually.
- Strip unknown fields with `.strict()` or explicit `.omit()` or simply by only reading from `parseResult.data`. Never read from the original `body` after a successful parse.
- Role, deleted, and other internal fields must never appear in any schema that clients can submit. Drop them at the schema boundary.
- `envSchema.js` lives here, not in `config/`. It is a schema definition, not config.

---

### `src/utils/validators.js`

Standard normalizers and validators:

- `normalizeEmail(email)`: `email.trim().toLowerCase()` — returns original if not a string.
- `normalizePhone(phone)`: `phone.trim()` — returns original if not a string.
- `isValidEmail(email)`: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `isValidPhoneNumber(phone)`: E.164 format `/^\+[1-9]\d{1,14}$/`.
- `isValidObjectId(id)`: `mongoose.isValidObjectId(id)`.
- `isValidImageUrl(url)`: check for `http://` or `https://` prefix.
- `isValidDateFormat(date)`: `!isNaN(Date.parse(date))`.

Add domain-specific validators for the Lambda here, not inline in services.

---

### `src/utils/i18n.js`

- `loadTranslations(lang)`: read from `locales/${lang}.json`, cache per language, fall back to `en`.
- `getTranslation(translations, key)`: resolve dotted path like `"auth.login.failed"` against the translations object. Return the key itself if not found — never throw.
- `SUPPORTED_LANGS` as a constant array. Any unsupported language falls back to `FALLBACK_LANG = "en"`.
- Read locale files from disk once at container startup (cached). Never re-read on every request.

---

### `src/utils/duplicateCheck.js` _(include only if Lambda performs pre-write uniqueness checks)_

Use `checkDuplicates(models, fields, excludeIds)` from UserRoutes for all pre-write uniqueness checks. This runs parallel DB queries and returns a structured list of conflicting fields, which allows callers to return precise 409 responses. Never skip this in favor of catching DB-level MongoServerError 11000 alone — the application-level check gives better error messages and supports cross-model checks.

---

### `src/utils/token.js` _(include only if Lambda issues JWTs or refresh tokens)_

- `issueCustomAccessToken(payload, options)`: `jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", expiresIn: "1h", ...options })`. Never let the algorithm be caller-controlled.
- Build access token payloads with the minimum set of claims that downstream services actually read. Do not include claims that are not consumed anywhere.
- `createRefreshToken(entityId)`: generate with `crypto.randomBytes(32)`, hash with SHA-256 before storing using `crypto.createHash("sha256").update(token).digest("hex")`. Store the hash, return the raw token to the client.
- `buildRefreshCookie(token, expiresAt)`: return a `Set-Cookie` header string with `HttpOnly; Secure; SameSite=Strict`.

Never store raw refresh tokens in MongoDB. Never sign JWTs with `algorithm: "none"`.

---

## Security Audit Checklist

All 19 findings from the UserRoutes security audit must be verified as addressed before signing off on any Lambda refactor. For each finding, either confirm the fix is in place or classify as `code-owned` or `infra-owned` deferred risk.

### Critical (must close before production)

- [ ] **C1 — No JWT verification**: every protected route must pass through `authJWT`. Confirm `authJWT` is called before any protected service and `PUBLIC_RESOURCES` is an explicit allowlist.
- [ ] **C2 — Raw entity returned in response**: every endpoint that returns a user, pet, NGO, or other DB document must call `sanitize{Entity}()` before responding. Confirm the sanitize helper strips password and internal fields before `createSuccessResponse`.
- [ ] **C3 — Horizontal privilege escalation via identity field in body**: every mutation route that accepts an owner or user identity in the body must have a self-access or ownership check before service execution. _Skip if Lambda has no mutation routes that accept an identity field._
- [ ] **C4 — Unauthenticated hard delete**: any delete route must require JWT and go through an ownership check before executing. Prefer soft-delete (`deleted: true`) over hard delete. _Skip if Lambda has no delete operations._
- [ ] **C5 — Delete without session revocation**: any entity delete that could leave active sessions open must revoke those sessions atomically. _Skip if Lambda does not manage auth sessions or issue tokens._
- [ ] **C6 — Takeover via upsert-based creation**: any route that uses `findOneAndUpdate` + `upsert` to create records without verifying caller identity must be frozen at 405 or replaced. _Skip if Lambda has no upsert-based creation flows._
- [ ] **C7 — Entity enumeration via differential responses**: public lookup or verification routes must not return different response shapes based on whether a record exists. Return identical generic success messages. _Skip if Lambda has no public lookup endpoints._
- [ ] **C8 — Identifier enumeration via verification endpoints**: verification or code-dispatch endpoints must return a uniform response regardless of whether the identifier is registered. _Skip if Lambda has no verification or code-dispatch flows._

### High Severity (must close before production)

- [ ] **H9 — Caller-controlled role at creation**: any field that controls access level or privilege (e.g. `role`, `tier`, `isAdmin`) must be hardcoded by the service, not accepted from the request body. Exclude such fields from Zod schemas. _Skip if Lambda has no resource-creation flows with access-level fields._
- [ ] **H10 — Body identity trusted for ownership in edit flows**: edit routes must extract the caller's identity from the JWT (`event.userId` or equivalent), not from the request body. Confirm every update service reads identity from the event, not from `parseResult.data`. _Skip if Lambda has no edit routes._
- [ ] **H11 — Sensitive lifecycle fields in edit allowlists**: `deleted`, `verified`, `role`, `credit`, `tokenHash` must never appear in any Zod schema or update-allowlist that a client can reach. Confirm by reading every Zod schema and every `$set` or `updateOne` call in the service.
- [ ] **H12 — Password hash in API responses**: apply output sanitization to every entity-returning endpoint. Confirm `sanitizeUser()` or equivalent is called on every returned entity before `createSuccessResponse`.
- [ ] **H13 — Missing RBAC on role-restricted resources**: any route restricted to a specific role must perform the role check at the guard layer before any service is reached. The role check must be based on the JWT claim, not on a request body field. _Skip if Lambda has no role-restricted routes._

### Medium Severity (must close before production)

- [ ] **M14 — No rate limiting on public flows**: apply `enforceRateLimit` on registration, login, password reset, SMS code generation, and SMS verification. Set appropriate limits and windows per action.
- [ ] **M15 — Raw error messages leak to clients**: catch blocks must call `logError` and return `createErrorResponse(500, "others.internalError", event)`. Never return `error.message` or stack traces.
- [ ] **M16 — Inconsistent status codes and response shape**: all responses must use `createErrorResponse` or `createSuccessResponse`. All error responses must include `success: false`, `errorKey`, `error`, `requestId`.
- [ ] **M17 — Delete without consistent token revocation**: soft-delete and token revocation must happen atomically. Use `Promise.all([softDelete, revokeTokens])`.

### Structural Risk (fix in same pass)

- [ ] **S18 — Fuzzy route matching via includes()/startsWith()/regex**: replace all such logic with exact key matching: `"${httpMethod} ${event.resource}"`. Confirm by reading the router — no string method other than direct `===` comparison may be used for route resolution.
- [ ] **S19 — Monolithic entrypoint**: entry file must not contain business logic. Move all orchestration into `handler.js`, routing into `router.js`, and logic into `services/`.

### Infra-Owned (document, do not pretend solved)

- [ ] **I20 — Race-condition duplicate creation**: application-level duplicate checks are not atomic. Only a DB unique index on the relevant field eliminates the race window. Document this as `infra-owned` if index creation is outside current control.

---

## Performance and Scalability Standards

### Lambda Cold Start

- Keep `index.js` to the minimum 4–6 lines. Every extra `require()` at the module level adds cold-start time.
- Use `lazyRoute()` in `router.js` so only the requested service module is loaded per invocation.
- `require("./config/env")` at the top of `handler.js` is the only mandatory top-level require besides direct infrastructure modules.
- `maxPoolSize: 1` in the Mongoose connection config is mandatory. Lambda containers do not benefit from connection pools larger than 1.

### DB Query Efficiency

- Use explicit `.select()` or `.projection()` on every DB read. Never return `_doc` or the full Mongoose document to the client.
- Use `.lean()` on read-only queries to avoid Mongoose document overhead.
- Aggregation pipelines must project early — put `$project` or `$unset` stages as close to the source as possible to avoid carrying unnecessary data through subsequent stages.
- Use `$match` with indexed fields as the first stage in every aggregation.
- Use `findOneAndUpdate` with `$setOnInsert` for upsert operations (such as rate limit counters) to minimize round-trips.
- Prefer `Promise.all([queryA, queryB])` for genuinely independent DB operations. Do not use it to make code look parallel when operations are logically sequential.

### Memory and Resource Use

- Do not `require()` large dependencies inside hot-path functions unless they are genuinely optional.
- Cache compiled Zod schemas at module level, not inside service functions.
- Cache locale translations at module load (see `i18n.js` pattern). Do not re-read locale files per request.
- Do not cache DB query results in module-level variables. Lambda containers are not shared — caching at that level creates stale-data bugs across invocations without meaningful hit rate.

---

## Maintainability Standards

### Module Responsibilities

Each module must have a single purpose. The test for this is: can you name what the module does in one phrase? If not, split it.

- `handler.js` — lifecycle orchestration only
- `router.js` — route dispatch only
- `cors.js` — CORS header logic only
- `authJWT.js` — token verification and event attachment only
- `guard.js` — request pre-validation only (JSON, empty body, self-access, RBAC, ObjectId)
- `selfAccess.js` — identity comparison only
- `db.js` — connection management only
- `env.js` — environment validation only
- `response.js` — response builders only
- `logger.js` — structured logging only
- `sanitize.js` — output sanitization only
- `rateLimit.js` — rate limit enforcement only
- `zod.js` — Zod error extraction helpers only
- `validators.js` — stateless format validators and normalizers only
- `i18n.js` — translation loading and resolution only
- `token.js` — JWT and refresh token operations only
- `duplicateCheck.js` — pre-write duplicate detection only
- `services/{domain}.js` — business workflow logic only, no transport or routing

### Naming Conventions

- Route key strings: `"${HTTP_METHOD} ${event.resource}"` — all caps method, exact resource template.
- Error keys: `"domain.errorType"` dot notation, all lowercase, matches locale JSON path.
- Scope strings in logs: `"module.functionName"` — matches file and exported function name.
- Policy map keys in `selfAccess.js`: same format as route keys.
- RBAC sets in `guard.js`: `SCREAMING_SNAKE_CASE` const names (`NGO_ONLY_RESOURCES`, `ADMIN_ONLY_RESOURCES`).

### Deprecation and Frozen Routes

- Any route that existed in the old Lambda but is no longer supported must be mapped explicitly to `null` in the routes object, producing a 405 response. Never silently drop routes.
- Document every frozen route in the Lambda's `CHANGELOG.md` under a `Behavior Changes` or `Deprecated Routes` section.

---

## Stability Standards

### Error Handling Rules

1. Every service function must have a top-level `try/catch`.
2. The catch block must: call `logError` with scope, event, and the caught error; return `createErrorResponse(500, "others.internalError", event)`. Never rethrow from a service.
3. Validation errors must return 400 before reaching the catch block.
4. Resource-not-found cases must return 404, not 500.
5. Conflict cases (duplicate email, duplicate ID) must return 409, not 500.
6. Auth failures from middleware must return 401 or 403 before service execution.

### Deleted and Inactive Record Handling

- Any endpoint that reads a user or related entity must filter `{ deleted: false }` or equivalent.
- Any login or token-issuance flow must check the account is not deleted before issuing tokens.
- Any endpoint that soft-deletes an entity must also invalidate related sessions atomically.
- Stale tokens from deleted accounts must be rejected. The deleted check must happen at query time in the service, not only at registration or login.

### Idempotency and Write Safety

- Duplicate registration must return 409, not 500.
- Double-delete must return 409, not 500.
- Idempotent reads must not fail with 500 on missing resources — return 404 with a clear error key.

---

## Documentation Requirements

Every refactored Lambda must produce or update:

### `CHANGELOG.md`

Sections required:

1. **Scope** — what was and was not changed
2. **Architecture Changes** — how the request flow changed
3. **Functional Improvements** — what behavior changed and why
4. **Validation And Error Handling Improvements** — what now returns 400 instead of 500
5. **Security Improvements** — which of the 20 security checklist items were addressed
6. **Performance And Maintainability Improvements** — DB projection changes, lazy loading, etc.
7. **Constraints And Deferred Work** — explicit list with `code-owned` or `infra-owned` label
8. **Result Of This Stage** — honest assessment of what the refactor achieved

### `README.md` or `API.md`

If the Lambda has a public API surface, document:
- route list with methods, paths, auth requirements, and brief description
- request body shape for POST/PUT routes
- response shape for main success cases
- known constraints or non-goals

---

## Direct Prompt Template

```text
You are refactoring an AWS Lambda in this monorepo as part of a mass In-Situ Modernization effort.
The quality baseline for every dimension is the existing `functions/UserRoutes` implementation.

Read the full `dev_docs/REFACTOR_CHECKLIST.md` before starting. Everything in that document is a hard specification, not a suggestion.

Target Lambda:
- Lambda folder: {{TARGET_LAMBDA_FOLDER}}
- Entry file: {{ENTRY_FILE}} ({{ENTRY_LINE_COUNT}} lines)
- Tier: {{TIER_1_FULL | TIER_2_PARTIAL | TIER_3_SIMPLE}}
- API contract constraints: {{CONTRACT_CONSTRAINTS}}
- Known non-goals: {{NON_GOALS}}
- Lambda-specific env vars required: {{ENV_VARS}}
- Lambda-specific models used: {{MODELS}}

Primary objective:
Refactor this Lambda so it is correct, secure, maintainable, testable, and traceable — without causing unnecessary contract drift.

Hard requirements:
1. Follow the Canonical Request Lifecycle from REFACTOR_CHECKLIST.md in exact order.
2. Implement every module from the Module-Level Implementation Standards section using the exact patterns shown.
3. Address every applicable item from the Security Audit Checklist. For each item, confirm it is fixed or classify as deferred with label.
4. Preserve the existing API contract unless a breaking change is explicitly approved.
5. Do not start with a full rewrite. Refactor one layer at a time.
6. After each layer edit, confirm the approach is consistent with the spec before widening scope.
7. Deprecated routes must be explicitly mapped to 405. Do not silently drop them.
8. Update `CHANGELOG.md` to match the final code.
9. Do not claim race-condition safety unless a DB unique index is actually enforced. Classify as infra-owned if not.

Before any edits:
1. Map the current request path from entrypoint to business logic.
2. Identify public routes, protected routes, role-restricted routes, and deprecated routes.
3. Identify where auth, validation, body parsing, DB connection, ownership checks, route freezing, and response formatting currently happen.
4. State one falsifiable hypothesis about the highest-risk slice before making the first edit.

Required final response format:

**1. Structural Changes**
Explain how the request flow changed. List every new file and its single responsibility.

**2. Behavior Changes**
Explain validation, auth, ownership, sanitization, rate limiting, logging, and response-shape changes.
List which API contracts were preserved and which changed.

**3. Security Audit Results**
For each of the 20 checklist items: FIXED / NOT APPLICABLE / DEFERRED (code-owned|infra-owned) with one-line explanation.

**4. Deferred Work**
List remaining gaps. Label each as code-owned or infra-owned.

Do not finish with only a file-movement summary. The refactor must produce a real, measurable improvement in correctness, security, testability, or traceability.
```

---

## Right-Sizing Decision Rules

Do not over-engineer small Lambdas. Use this decision table:

| Question | Yes → | No → |
|---|---|---|
| Entry file > 500 lines? | Tier 1: apply full layout | Continue |
| Entry file 200–500 lines OR multiple routes? | Tier 2: handler + partial split | Continue |
| Entry file < 200 lines AND single route? | Tier 3: keep flat, enforce behavioral standards only | — |
| Lambda is authentication-critical (issues tokens, verifies identities)? | Escalate to Tier 1 regardless of size | — |
| Lambda handles file upload or external service calls (S3, Twilio, payment)? | Escalate to Tier 1 or Tier 2 regardless of size | — |
| Lambda modifies user or financial records? | Escalate to at least Tier 2 | — |

Tier 3 Lambdas still must have:
- `400` not `500` on bad input
- Structured JSON logging
- Centralized response shape (`success: true/false`, `errorKey`, `requestId`)
- CORS headers on all responses
- Auth before protected logic
- DB connection reuse (singleton pattern)
- Sanitized outbound payloads

---

## Stop Criteria

The refactor is complete when all of the following are true:

- [ ] The request flow is traceable without reading a single large file.
- [ ] Validation and auth behavior are predictable and in the correct lifecycle order.
- [ ] Every applicable security audit checklist item is fixed or classified.
- [ ] All major failure paths return structured errors, not generic 500.
- [ ] Log output is sufficient to diagnose the next production failure without code reading.
- [ ] Remaining open risk is documented as `code-owned` or `infra-owned`.
- [ ] `CHANGELOG.md` is updated with all required sections.
- [ ] Remaining work is optimization or future redesign, not structural instability.

---

## Short Version

For quick reference when attaching to a smaller context window:

```text
Refactor the target Lambda to the UserRoutes standard defined in dev_docs/REFACTOR_CHECKLIST.md.

Implement the Canonical Request Lifecycle with the correct stage separation: OPTIONS → authJWT → cheap guard → DB → router → service, with DB-backed ownership checks allowed at service start when they require a fetched resource.

Apply the module patterns from REFACTOR_CHECKLIST.md at the right scope: thin index.js, handler orchestration, explicit router (if multi-route), lazyRoute dispatch, Zod validation with locale dot-key error messages, structured JSON logging, createErrorResponse/createSuccessResponse for all responses, singleton DB connection with maxPoolSize:1, env Zod validation at startup. Preserve existing public `errorKey` values unless a contract change is explicitly approved. Include enforceRateLimit only if the Lambda has public or sensitive write flows. Include sanitize{Entity}() on any endpoint returning DB documents. Include selfAccess.js, token.js, and duplicateCheck.js only if the Lambda actually needs them.

Address all 20 security checklist items. Classify each as FIXED, NOT APPLICABLE, or DEFERRED(code-owned|infra-owned).

Preserve existing API contracts unless explicitly approved otherwise. Freeze deprecated routes at 405. Do not claim race-condition safety without a DB unique index. Do not over-engineer small Lambdas — use the tier decision table.

Produce a CHANGELOG.md covering all required sections. Classify remaining work as code-owned or infra-owned.
```
