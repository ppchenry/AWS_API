# PetMedicalRecord Security

## Security Measures

### Authentication
- All routes require JWT authentication via `Authorization: Bearer <token>` header.
- JWT verification uses `HS256` algorithm explicitly to block `alg:none` attacks.
- `JWT_BYPASS` is only allowed when `NODE_ENV !== "production"`.
- Missing or invalid `JWT_SECRET` returns 500, not a bypass.

### CORS
- Origin-based CORS allowlist from `ALLOWED_ORIGINS` env var.
- No wildcard `Access-Control-Allow-Origin: *` — only explicitly allowed origins.
- OPTIONS preflight returns 403 for disallowed origins.

### Input Validation
- All path parameters validated as valid MongoDB ObjectIds before DB access.
- JSON body parsing with explicit error handling (400, not 500).
- Zod schema validation on all POST/PUT payloads.
- Date format validation before parsing.
- Empty body rejected on POST/PUT routes.

### Output Sanitization
- Internal Mongoose fields (`__v`, `createdAt`, `updatedAt`) stripped from responses.
- Structured error responses never leak stack traces or raw error messages.

### Structured Logging
- All errors logged with structured JSON format (timestamp, level, scope, request context).
- No secrets, tokens, or full request bodies logged.

## Known Constraints

- **Hard delete**: Records are hard-deleted (no soft-delete). This is consistent with the original behavior. No session revocation is needed as this Lambda does not manage auth sessions.
- **No rate limiting**: This Lambda has no public routes and no sensitive write flows requiring rate limiting.
- **No ownership check**: Pet ownership verification would require loading the Pet document and comparing `userId` to the JWT caller. This is deferred as an infra-owned concern — the API Gateway authorizer is expected to handle coarse-grained access control.
