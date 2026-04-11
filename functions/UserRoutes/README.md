# UserRoutes Lambda

This Lambda owns user registration, login, profile management, NGO account flows, and SMS verification.

## Current Status

UserRoutes is already on the modularized runtime path. The active AWS entrypoint is `index.js`, which delegates directly to `src/handler.js`.

Current request lifecycle:

```text
API Gateway event
  -> index.js
  -> src/handler.js
  -> src/cors.js (OPTIONS handling)
  -> src/middleware/authJWT.js
  -> src/config/db.js
  -> src/middleware/guard.js
  -> src/router.js
  -> src/services/*
  -> src/utils/response.js
```

## Folder Structure

```text
UserRoutes/
├── index.js
├── package.json
├── API.md
├── CHANGELOG.md
├── README.md
└── src/
    ├── handler.js
    ├── router.js
    ├── cors.js
    ├── config/
    ├── locales/
    ├── middleware/
    ├── models/
    ├── services/
    ├── utils/
    └── zodSchema/
```

## Active Modules

### `src/config/`

- `env.js`: validates required environment variables at startup.
- `db.js`: initializes and reuses the Mongoose connection and model registrations.

### `src/middleware/`

- `authJWT.js`: verifies Bearer tokens and attaches JWT identity fields to `event`.
- `guard.js`: parses JSON, enforces non-empty POST/PUT bodies, applies self-access checks, performs NGO-only RBAC, and validates selected path params.
- `selfAccess.js`: blocks protected requests when JWT identity does not match `userId` or `email` ownership rules.

### `src/services/`

- `login.js`: email login and NGO login flows.
- `register.js`: regular and NGO registration flows.
- `user.js`: get, update, and delete user/account flows.
- `update.js`: password and image updates.
- `ngo.js`: NGO details, NGO edit, pet placement options, and NGO user list.
- `ngoUserListPipeline.js`: aggregation pipeline builder for NGO user-list queries.
- `sms.js`: SMS code generation and verification.

### `src/utils/`

- `response.js`: standardized success and error responses with translation lookup and CORS headers.
- `i18n.js`: locale loading and translation-key lookup.
- `validators.js`: email, phone, date, image URL, and ObjectId helpers.
- `zod.js`: helpers for extracting stable error keys from Zod v4 issues.
- `token.js`: JWT access-token issuance and refresh-token helpers.
- `rateLimit.js`: Mongo-backed rate limiting keyed by client IP and action.
- `duplicateCheck.js`: duplicate detection helper for model-level conflict checks.
- `objectUtils.js`: dot-path flattening and allowlist filtering for partial updates.
- `sanitize.js`: strips sensitive fields such as `password` from user-shaped response payloads.
- `logger.js`: structured logging helpers for request-scope error reporting.

### `src/zodSchema/`

Zod schemas for request-body validation across login, register, update, NGO edit, and SMS flows.

## Routing Model

`src/router.js` dispatches on `{HTTP_METHOD} {event.resource}` and lazy-loads service modules so unrelated handlers are not loaded on every invocation.

Current routed endpoints include:

- `POST /account/register`
- `POST /account/login`
- `POST /account/register-ngo`
- `GET /account/{userId}`
- `PUT /account`
- `PUT /account/update-password`
- `POST /account/update-image`
- `POST /account/delete-user-with-email`
- `GET /account/user-list`
- `GET|PUT /account/edit-ngo/{ngoId}`
- `GET /account/edit-ngo/{ngoId}/pet-placement-options`
- `POST /account/generate-sms-code`
- `POST /account/verify-sms-code`

Deprecated routes such as `POST /account/login-2` and the older register variants are still explicitly mapped to `405` responses.

## Current Behavior Notes

- Public routes are defined in `handler.js` and bypass JWT enforcement.
- Protected routes always pass through `authJWT` before service logic.
- NGO-only routes are enforced in `middleware/guard.js` via `NGO_ONLY_RESOURCES`.
- JSON body parsing happens in the guard, not inside services.
- Malformed JSON returns `400` with `others.invalidJSON` before route logic runs.
- Response translation lookup is centralized in `utils/response.js`.
- User detail responses are sanitized so password hashes are never returned.
- Login, SMS, register, and NGO-register flows use Mongo-backed rate limiting.

## Testing Baseline

Current integration suite: `__tests__/test-userroutes.test.js`

Verified baseline as of 2026-04-11:

- `102 / 102` tests passing
- SAM local API exercised through `http://localhost:3000`
- coverage includes auth failures, malformed JSON, rate limiting, NGO RBAC, duplicate conflicts, NoSQL-style payload rejection, and deleted-user follow-up behavior

## Environment Variables

This Lambda depends on:

- `MONGODB_URI`
- `JWT_SECRET`
- `REFRESH_TOKEN_MAX_AGE_SEC`
- `ALLOWED_ORIGINS`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

## Notes For Contributors

- Keep `index.js` thin and route new behavior through `src/handler.js` and `src/router.js`.
- Add endpoint behavior in service modules, not in the entrypoint.
- Put request-blocking policy in middleware when it should run before service logic.
- Keep response formatting inside `utils/response.js` instead of rebuilding response objects inline.
- Do not return raw user records from services without sanitizing sensitive fields.
- If a uniqueness rule matters operationally, prefer a DB index in addition to application-level checks.
