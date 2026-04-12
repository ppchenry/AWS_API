# PetBasicInfo Lambda

This Lambda owns pet profile reads, profile updates, pet soft-delete, and eye-analysis log retrieval.

## Current Status

On the modularized runtime path. The active AWS entrypoint is `index.js`, which delegates to `src/handler.js`.

Request lifecycle:

```text
API Gateway event
  -> index.js
  -> src/handler.js          (OPTIONS, auth, cheap guard, DB, router, catch-all)
  -> src/cors.js             (OPTIONS preflight)
  -> src/middleware/authJWT.js
  -> src/middleware/guard.js      (petID format + body parse — no DB)
  -> src/config/db.js
  -> src/router.js
  -> src/services/basicInfo.js    (GET/PUT/DELETE)
  -> src/services/eyeLog.js       (GET eyeLog)
  -> src/middleware/selfAccess.js (DB-backed pet existence + ownership check inside services)
  -> src/utils/rateLimit.js       (DELETE only: 429 before pet lookup)
  -> src/utils/response.js
```

## Folder Structure

```text
PetBasicInfo/
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
    │   ├── db.js
    │   └── env.js
    ├── cors.js
    ├── locales/
    │   ├── en.json
    │   └── zh.json
    ├── middleware/
    │   ├── authJWT.js
    │   ├── guard.js
    │   └── selfAccess.js
    ├── models/
    │   ├── pet.js
    │   ├── EyeAnalysisRecord.js
    │   └── RateLimit.js
    ├── services/
    │   ├── basicInfo.js
    │   └── eyeLog.js
    ├── utils/
    │   ├── i18n.js
    │   ├── dateParser.js
    │   ├── logger.js
    │   ├── rateLimit.js
    │   ├── response.js
    │   ├── sanitize.js
    │   ├── validators.js
    │   └── zod.js
    └── zodSchema/
        ├── envSchema.js
        └── petBasicInfoSchema.js
```

## Active Modules

### `src/config/`

- `env.js`: validates required environment variables at startup via Zod; throws on misconfiguration.
- `db.js`: singleton Mongoose connection with `maxPoolSize: 1`; registers `Pet`, `EyeAnalysisRecord`, and `RateLimit` models on first connection.

### `src/middleware/`

- `authJWT.js`: verifies Bearer tokens with `algorithms: ["HS256"]` and attaches `userId`, `userEmail`, `userRole`, and `ngoId` to `event`.
- `guard.js`: parses JSON body, rejects empty PUT/POST bodies, and validates `petID` ObjectId format before the DB connection is opened.
- `selfAccess.js`: `loadAuthorizedPet({ event })` loads the pet from MongoDB, returns a uniform `404` for missing or soft-deleted pets, and enforces owner-or-NGO access.

### `src/services/`

- `basicInfo.js`: GET, PUT, and DELETE handlers for `/pets/{petID}/basic-info` and `/pets/{petID}`. Zod validation on PUT; `sanitizePet()` on GET; soft-delete on DELETE; rate limit only on DELETE.
- `eyeLog.js`: GET handler for `/pets/{petID}/eyeLog`. Reads `petID` from `event.pathParameters.petID` and returns up to 100 records sorted by `createdAt` descending.

### `src/utils/`

- `response.js`: `createErrorResponse` (server-translates error key) and `createSuccessResponse` (passes locale dot-keys to client as-is). Both merge CORS headers.
- `i18n.js`: locale loading with per-container cache; falls back to `en`.
- `sanitize.js`: `sanitizePet()` — explicit allowlist that prevents `deleted`, `__v`, and any future schema additions from leaking into responses.
- `rateLimit.js`: `enforceRateLimit({ event, action, identifier, limit, windowSec })` — fixed-window counter backed by the `RateLimit` MongoDB collection; uses `findOneAndUpdate` upsert with `$inc`.
- `validators.js`: `isValidObjectId`, `isValidDateFormat`, `isValidImageUrl`, `isValidNumber`, `isValidBoolean`.
- `zod.js`: `getFirstZodIssueMessage` / `getJoinedZodIssueMessages` — safe against Zod v4 `error.issues` shape.
- `logger.js`: structured JSON logging (`logInfo`, `logWarn`, `logError`).
- `dateParser.js`: parses `DD/MM/YYYY`, `YYYY-MM-DD`, and ISO strings into `Date`.

## Routing Model

`src/router.js` dispatches on `{HTTP_METHOD} {event.resource}` and lazy-loads service modules.

Routed endpoints:

| Method   | Resource                         | Handler                       |
| -------- | -------------------------------- | ----------------------------- |
| `GET`    | `/pets/{petID}/basic-info`       | `basicInfo.getPetBasicInfo`   |
| `PUT`    | `/pets/{petID}/basic-info`       | `basicInfo.updatePetBasicInfo`|
| `POST`   | `/pets/{petID}/basic-info`       | routed to `405 methodNotAllowed` |
| `DELETE` | `/pets/{petID}`                  | `basicInfo.deletePetBasicInfo`|
| `GET`    | `/pets/{petID}/eyeLog`           | `eyeLog.getPetEyeAnalysisLogs`|

The POST basic-info route is exposed in SAM only so the Lambda can return a consistent `405` response instead of SAM returning `403` before the handler runs.

## Current Behavior Notes

- All routes are JWT-protected. `PUBLIC_RESOURCES` is an explicit empty array.
- Input validation (body parse, empty body, petID format) runs in `guard.js` **before** the DB connection is opened, so malformed requests are rejected without touching the database.
- Ownership enforcement and pet existence checks happen in `selfAccess.loadAuthorizedPet()` from inside services, after the DB connection is available.
- For DELETE requests, a rate limit check (10 requests per 60 s per authenticated user) runs after the DB connection but **before** the pet existence lookup. This means rate-limited requests never trigger a DB pet query.
- PUT body validation uses a Zod allowlist schema with `.passthrough() + superRefine() + transform()` so unknown fields still return the locale key `petBasicInfo.errors.invalidUpdateField` without relying on raw Zod `unrecognized_keys` text.
- `tagId`, `ngoPetId`, `owner`, and `ngoId` are not updatable through the schema; sending them returns `400`.
- Soft-delete sets `deleted: true` and clears `tagId`. The record remains in the database.
- Missing and soft-deleted pets both return `petBasicInfo.errors.petNotFound`; callers cannot distinguish those states.
- Success `message` fields contain locale dot-keys (e.g. `"petBasicInfo.success.retrievedSuccessfully"`). Clients resolve these using the locale files in `src/locales/`.
- Error responses are server-translated via `createErrorResponse`.

## Testing Baseline

Integration suite: `__tests__/test-petbasicinfo.test.js`

Requires `sam local start-api --env-vars env.json` running on port 3000.

Coverage:

- CORS preflight (allowed origin, disallowed origin, missing origin)
- JWT rejection (no token, expired, garbage, missing Bearer prefix, tampered signature, alg:none, response shape)
- Pet ID validation (invalid format, valid-format nonexistent)
- Ownership denial (GET + PUT + DELETE with stranger JWT)
- GET basic-info (success, sanitize check, CORS header on response)
- PUT guard validation (malformed JSON, empty body) — runnable without a real pet
- PUT Zod validation (invalid weight type, unknown field, tagId, bad date) — requires `TEST_PET_ID`
- PUT success — requires `TEST_PET_ID`
- GET eyeLog (auth rejection, success + petId scoping assertion)
- DELETE (auth rejection, invalid ID, nonexistent pet, stranger ownership denial, rate limit 429)
- DELETE lifecycle (owner soft-delete + subsequent uniform 404) when `TEST_DISPOSABLE_PET_ID` is configured to a separate live pet
- Coverage gate: logs a warning when pet-fixture tests are skipped
- 405 for unsupported methods

Pet-specific tests are skipped if `TEST_PET_ID` and `TEST_OWNER_USER_ID` are not set in `env.json`. The delete lifecycle test is skipped unless `TEST_DISPOSABLE_PET_ID` is also set to a different live pet owned by the same user.

To run:

```bash
npm test -- --testPathPattern=test-petbasicinfo
```

## Environment Variables

| Variable          | Required | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `MONGODB_URI`     | Yes      | MongoDB connection string                        |
| `JWT_SECRET`      | Yes      | Secret for HS256 JWT verification                |
| `ALLOWED_ORIGINS` | Yes      | Comma-separated list of allowed CORS origins     |
| `JWT_BYPASS`      | No       | Set to `"true"` to skip JWT in non-production    |
| `NODE_ENV`        | No       | Defaults to `"development"`                      |

`env.json` also accepts `TEST_PET_ID`, `TEST_OWNER_USER_ID`, and `TEST_DISPOSABLE_PET_ID` for the integration suite; these are not read by the Lambda at runtime.
