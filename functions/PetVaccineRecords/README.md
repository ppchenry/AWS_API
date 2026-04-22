# PetVaccineRecords Lambda

This Lambda owns pet-scoped vaccine record reads and CRUD mutations.

## Current Status

On the modularized runtime path. The AWS entrypoint is `index.js`, which delegates to `src/handler.js`.

Request lifecycle:

```text
API Gateway event
  -> index.js
  -> src/handler.js
  -> src/cors.js             (OPTIONS preflight)
  -> src/middleware/authJWT.js
  -> src/middleware/guard.js (JSON parse, empty body, ObjectId checks)
  -> src/config/db.js
  -> src/router.js
  -> src/services/vaccine.js
  -> src/middleware/selfAccess.js (DB-backed pet ownership/NGO access)
  -> src/utils/response.js
```

## Folder Structure

```text
PetVaccineRecords/
├── index.js
├── package.json
├── API.md
├── CHANGELOG.md
├── README.md
├── locales/
├── models/
└── src/
    ├── handler.js
    ├── router.js
    ├── cors.js
    ├── config/
    ├── middleware/
    ├── services/
    ├── utils/
    └── zodSchema/
```

## Active Modules

### `src/config/`

- `env.js`: validates `MONGODB_URI`, `JWT_SECRET`, and `ALLOWED_ORIGINS` at startup.
- `db.js`: reuses the MongoDB connection and registers `Pet` and `Vaccine_Records` models.

### `src/middleware/`

- `authJWT.js`: verifies Bearer tokens with HS256 and attaches caller identity to `event`.
- `guard.js`: parses JSON, rejects empty POST/PUT bodies, validates `petID`, and validates `vaccineID` on record routes.
- `selfAccess.js`: loads the pet from MongoDB and enforces owner-or-NGO access.

### `src/services/`

- `vaccine.js`: GET, POST, PUT, and DELETE handlers for vaccine records.

### `src/utils/`

- `response.js`: standard success and error responses with merged CORS headers.
- `sanitize.js`: explicit vaccine-record response filtering.
- `validators.js`: ObjectId and date validation helpers.
- `i18n.js`: locale lookup.
- `zod.js`: stable extraction of Zod error keys.
- `logger.js`: structured logs.

## Routing Model

`src/router.js` dispatches on exact `${event.httpMethod} ${event.resource}` keys and lazy-loads the vaccine service.

Routed endpoints:

- `GET /pets/{petID}/vaccine-record`
- `POST /pets/{petID}/vaccine-record`
- `PUT /pets/{petID}/vaccine-record/{vaccineID}`
- `DELETE /pets/{petID}/vaccine-record/{vaccineID}`

Only the documented vaccine-record routes are wired through SAM for this Lambda.

## Current Behavior Notes

- All routes are JWT-protected. `PUBLIC_RESOURCES` is an explicit empty array.
- Guard validation runs before the DB connection, so malformed JSON and invalid IDs return `400` without touching MongoDB.
- Ownership enforcement is DB-backed through `loadAuthorizedPet()` inside the service layer.
- Vaccine record deletes are soft deletes. Records are marked with `isDeleted: true` and `deletedAt`, then excluded from reads, updates, count maintenance, and latest-date maintenance.
- Update and delete operations are scoped by both `petId` and vaccine record `_id`.
- Unsupported methods return Lambda-level `405`, not a route fallback or API Gateway default.

## Testing Baseline

Integration suite: `__tests__/test-petvaccinerecords.test.js`

Coverage includes:

- CORS preflight behavior
- JWT rejection paths
- malformed JSON and empty-body guard behavior
- pet and vaccine ID validation
- owner/NGO authorization
- fixture-backed create, update, soft-delete, and deleted-record hiding behavior
- exact-route `405` behavior for unsupported `PATCH`

## Environment Variables

- `MONGODB_URI`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `JWT_BYPASS` (optional, non-production only)
- `NODE_ENV` (optional)

Test-only fixture variables in `env.json`:

- `TEST_PET_ID`
- `TEST_OWNER_USER_ID`
- `TEST_NGO_ID`

## Notes For Contributors

- Keep `index.js` thin and route behavior through `src/handler.js` and `src/router.js`.
- Keep active-record filtering aligned with the schema soft-delete fields when changing vaccine record queries.
- Do not reintroduce hard delete behavior unless the checklist baseline is changed explicitly.
