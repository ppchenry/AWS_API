# AuthRoute — Changelog

## Stage 2: Handler Lifecycle Conformance & Test Contract Audit

**Scope:** Align AuthRoute's request lifecycle with the canonical checklist, add missing middleware layers, and correct test contract assumptions.

### Architecture Changes

- **Explicit lifecycle stages in `handler.js`**: The handler now follows the canonical ordering — OPTIONS → authJWT → guard → DB → router — with numbered comments matching the checklist.
- **`PUBLIC_RESOURCES` allowlist**: Added `["/auth/refresh"]` as an explicit allowlist. The refresh endpoint authenticates via cookie-based refresh tokens, not Bearer JWTs, so authJWT errors are correctly ignored for public resources.
- **`src/middleware/authJWT.js` (new)**: Local JWT authentication middleware following the UserRoutes pattern. Supports `JWT_BYPASS` dev guard in non-production, Bearer token extraction, HS256 verification, and identity attachment via `_attachUserToEvent()`.
- **`src/middleware/guard.js` (new)**: Minimal request guard. AuthRoute's refresh endpoint uses cookies rather than a JSON body, so there is no body to parse or path parameters to validate. The guard exists for lifecycle conformance without over-engineering the single-route case.

### Functional Improvements

- **ENV validation comment**: Added explicit `// Trigger ENV validation immediately at cold start` comment to match the standard documentation practice.
- **`JWT_BYPASS` added to `envSchema.js`**: The env schema now accepts the optional `JWT_BYPASS` variable, enabling the dev bypass flow consistently with other Lambdas.

### Validation and Error Handling

- **`others.unauthorized` locale key**: Added to both `en.json` and `zh.json` so authJWT can return properly translated 401 responses if non-public routes are added in the future.

### Security Improvements

- **authJWT runs before DB**: Even though all current AuthRoute resources are public, the authJWT middleware now runs in the correct lifecycle position. If protected routes are added later, they will be gated by default without handler changes.
- **Algorithm pinning**: authJWT enforces `algorithms: ["HS256"]` to prevent algorithm confusion attacks.

### Performance and Maintainability

- **DB connection deferred past cheap checks**: The handler now runs OPTIONS, authJWT, and the guard layer before opening the DB connection. Malformed or unauthorized requests (for any future protected routes) fail without touching MongoDB.
- **Consistent structure with UserRoutes**: AuthRoute now follows the same `src/middleware/` layout, making it easier to apply future shared changes uniformly.

### Test Contract Corrections

- **Renamed misleading test**: `"returns 405 for frozen refresh methods"` → `"returns 405 for unmapped methods (Lambda safety net, not deployed in API Gateway)"`. The original title implied PUT /auth/refresh was a deployed API Gateway route. In reality, `template.yaml` only maps OPTIONS and POST for `/auth/refresh`, so unmapped methods never reach the Lambda in production. The test now documents this as a Lambda-level safety net.
- **Handler-level integration tests added**: POST /auth/refresh through the full handler lifecycle, PUBLIC_RESOURCES bypass verification, and authJWT gating for non-public resources.
- **authJWT middleware unit tests added**: Valid Bearer token with identity attachment, malformed Bearer header, expired/tampered token, missing JWT_SECRET, JWT_BYPASS in non-production, and JWT_BYPASS ignored in production.

### Shared Baseline Limitations (not AuthRoute regressions)

- **Cookie path implementation**: `getCookiePath()` in `utils/token.js` uses stage-based path logic. This is identical to the current behavior and is classified as a shared baseline pattern, not an AuthRoute-specific issue.
- **Local utility copies**: AuthRoute still uses its own `cors.js`, `utils/response.js`, `utils/logger.js`, and `utils/i18n.js` rather than the shared layer factories (`shared/utils/response.js`, `shared/config/db.js`, etc.). Migrating to the shared factories is deferred to a separate shared-baseline uplift pass to avoid coupling this lifecycle fix to a broader refactor.

### Constraints and Deferred Work

- No new routes were invented. The only deployed routes remain OPTIONS and POST on `/auth/refresh`.
- The refresh-session service logic (`services/refresh.js`) was not modified.
- Shared factory migration (response, db, env, router) is deferred to a dedicated uplift pass.
- The guard layer is intentionally minimal for the single-route case but is structurally ready for extension.

### Result

AuthRoute now conforms to the canonical lifecycle ordering. The middleware layer is in place, the handler-level tests cover the full POST /auth/refresh path through the lifecycle (PUBLIC_RESOURCES bypass, authJWT gating for non-public resources, handler-to-service wiring), a dedicated authJWT middleware suite covers all branches, and all 19 tests pass.
